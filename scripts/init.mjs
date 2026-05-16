import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { runDoctor } from "./doctor.mjs";
import { createLock, lockEntriesFromPlannedEntries, sha256 } from "./lock.mjs";
import { loadProfile } from "./profiles.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(SCRIPT_DIR, "..");
const HARNESS_VERSION = "0.1.0";
const PACKAGE_NAME = "portable-harness";

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function repoName(targetRoot) {
  const name = targetRoot.split(/[\\/]/).filter(Boolean).at(-1);
  return name || "target-repo";
}

function ensureParent(file) {
  mkdirSync(dirname(file), { recursive: true });
}

function readSource(file) {
  return readFileSync(join(SOURCE_ROOT, file), "utf8");
}

function readSourceYaml(file) {
  return parseYaml(readSource(file));
}

function printInitHelp() {
  console.log(`harness init

Usage:
  harness init [--profile <profile>] [--target <path>] [--force] [--dry-run]

Options:
  --profile <profile>   Install a profile from profiles/. Defaults to minimal.
  --target <path>       Target repository root. Defaults to the current dir.
  --force               Definitively overwrite planned harness artifacts.
  --dry-run             Print the install plan without writing files.
  --allow-non-git       Permit installation into a directory without .git.
  -h, --help            Show this help.
`);
}

function collectExistingArtifacts(targetRoot, planned) {
  return planned
    .filter((entry) => {
      const path = join(targetRoot, entry.path);
      if (!existsSync(path)) return false;
      if (entry.type === "directory") return !statSync(path).isDirectory();
      return true;
    })
    .map((entry) => entry.path);
}

function collisionWarning(count) {
  return `${count} planned harness artifact(s) already exist; rerun with --force to overwrite them`;
}

function writePlannedEntries(targetRoot, planned) {
  for (const entry of planned) {
    const outPath = join(targetRoot, entry.path);
    if (entry.type === "directory") {
      mkdirSync(outPath, { recursive: true });
      continue;
    }

    ensureParent(outPath);
    writeFileSync(outPath, entry.content);
  }
}

function printPlan({ targetRoot, profile, entries, dryRun, collisions = [], overwrites = [], warnings = [] }) {
  const label = dryRun ? "dry-run plan" : "install plan";
  console.log(`Harness init: ${label}`);
  console.log(`target: ${targetRoot}`);
  console.log(`profile: ${profile}`);
  console.log(`files:`);
  for (const entry of entries) {
    console.log(`  ${entry.path}`);
  }
  if (collisions.length > 0) {
    console.log(`collisions:`);
    for (const file of collisions) {
      console.log(`  ${file}`);
    }
  }
  if (overwrites.length > 0) {
    console.log(`overwriting:`);
    for (const file of overwrites) {
      console.log(`  ${file}`);
    }
  }
  if (warnings.length > 0) {
    console.log(`warnings:`);
    for (const warning of warnings) {
      console.log(`  ${warning}`);
    }
  }
}

function printFailure(errors, warnings = []) {
  for (const warning of warnings) {
    console.error(`warn ${warning}`);
  }
  for (const error of errors) {
    console.error(`fail ${error}`);
  }
  console.error("");
  console.error(`Harness init: failed (${errors.length} error(s))`);
}

function loadSourceModule(moduleId) {
  const registryYaml = readSourceYaml("modules/registry.yaml");
  const entry = registryYaml?.modules?.find((item) => item.id === moduleId);
  if (!entry?.path) {
    return { error: `module '${moduleId}' is not in modules/registry.yaml` };
  }

  const moduleYaml = readSourceYaml(entry.path);
  const module = moduleYaml?.module;
  if (!module) {
    return { error: `${entry.path}: missing top-level module key` };
  }

  if (module.id !== moduleId) {
    return { error: `${entry.path}: module id '${module.id}' does not match '${moduleId}'` };
  }

  return { entry, module };
}

function profileModules(profile) {
  const modules = [];
  const errors = [];
  const ids = new Set();

  for (const moduleId of profile.modules) {
    if (ids.has(moduleId)) {
      errors.push(`profile '${profile.id}' includes duplicate module '${moduleId}'`);
      continue;
    }
    ids.add(moduleId);

    const loaded = loadSourceModule(moduleId);
    if (loaded.error) {
      errors.push(loaded.error);
    } else {
      modules.push(loaded);
    }
  }

  for (const moduleId of ["agent-operating-contract", "progressive-orientation"]) {
    if (!ids.has(moduleId)) {
      errors.push(`profile '${profile.id}' is missing required init module '${moduleId}'`);
    }
  }

  return { modules, errors };
}

function managedFilesFor(modules) {
  return modules.flatMap(({ module }) => (module.managed_files ?? []).map((file) => ({
    path: file.path,
    owner: module.id,
    mode: file.mode ?? "merge",
  })));
}

function moduleRefsFor(modules) {
  return modules.map(({ module }) => ({
    id: module.id,
    version: module.version,
    status: module.status ?? "active",
    process_domains: module.process_domains ?? [],
  }));
}

function commandsFor(modules) {
  const commands = {
    doctor: "harness doctor",
    "modules-list": "harness modules list",
    "modules-add": "harness modules add",
    "profiles-list": "harness profiles list",
    "lock-refresh": "harness lock refresh",
    "lock-check": "harness lock check",
    "upgrade-plan": "harness upgrade --plan",
    "upgrade-apply": "harness upgrade apply",
  };

  for (const { module } of modules) {
    for (const [name, command] of Object.entries(module.commands ?? {})) {
      commands[name] = command;
    }
  }

  return commands;
}

function moduleDefinitionEntries(modules) {
  return modules.map(({ module }) => {
    const path = `modules/${module.id}/module.yaml`;
    const content = readSource(path);
    return {
      type: "file",
      path,
      content,
      lock_source: {
        source: "module-definition",
        source_path: path,
        source_sha256: sha256(content),
      },
    };
  });
}

function moduleArtifactPlan(modules) {
  const entries = [];
  const errors = [];
  for (const { module } of modules) {
    for (const artifact of module.install?.artifacts ?? []) {
      if (artifact.type === "directory") {
        entries.push({ type: "directory", path: artifact.path });
        continue;
      }

      if (artifact.type === "template") {
        if (!existsSync(join(SOURCE_ROOT, artifact.source))) {
          errors.push(`${artifact.source}: source template missing`);
          continue;
        }

        const content = readSource(artifact.source);
        entries.push({
          type: "file",
          path: artifact.path,
          content,
          lock_source: {
            source: "module-template",
            source_path: artifact.source,
            source_sha256: sha256(content),
          },
        });
      }

      if (artifact.type !== "directory" && artifact.type !== "template") {
        errors.push(`${module.id}: unsupported artifact type '${artifact.type}'`);
      }

    }
  }
  return { entries, errors };
}

function buildFiles({ targetRoot, profile, date }) {
  const name = repoName(targetRoot);
  const loadedProfile = loadProfile(profile, SOURCE_ROOT);

  if (loadedProfile.error) return { errors: [loadedProfile.error], entries: [] };

  const loadedModules = profileModules(loadedProfile.profile);
  if (loadedModules.errors.length > 0) return { errors: loadedModules.errors, entries: [] };

  const modules = loadedModules.modules;
  const artifactPlan = moduleArtifactPlan(modules);
  if (artifactPlan.errors.length > 0) return { errors: artifactPlan.errors, entries: [] };

  const manifest = {
    harness: {
      manifest_version: 1,
      installed_at: date,
      harness_version: HARNESS_VERSION,
      profile,
      source: {
        type: "package",
        package: PACKAGE_NAME,
        channel: "dev",
      },
      modules: moduleRefsFor(modules),
      managed_files: managedFilesFor(modules),
      commands: commandsFor(modules),
      upgrade: {
        policy: "plan-first",
      },
    },
  };

  const entries = [
      {
        type: "file",
        path: "AGENTS.md",
        content: `# Agent Instructions

Harness metadata:
- package: ${PACKAGE_NAME}
- version: ${HARNESS_VERSION}
- profile: ${profile}

This repo has the portable harness installed with the \`${profile}\` profile.

## Boot Sequence

On every substantive session:

1. Read this file.
2. Read \`status.md\`.
3. Read \`index.yaml\`.
4. Read \`state/CONTEXT.md\`.
5. Open deeper docs only when the task requires them.

## Status Discipline

\`status.md\` is the current project-state projection. It is not a changelog.

After significant choices, build steps, or repo-structure changes, update
\`status.md\` in place so future sessions can orient quickly.

## Lock Discipline

Use \`harness lock check\` to inspect installed-file provenance drift.

After intentional changes to harness-managed files, use
\`harness lock refresh\` before final validation.
`,
      },
      {
        type: "file",
        path: "status.md",
        content: `# ${name} Status

Last updated: ${date}

## Current Phase

Harness installed with the \`${profile}\` profile.

## Current Decisions

- The repo uses the portable harness \`${profile}\` profile.
- Active harness profile: \`${profile}\`.
- Installed harness package: \`${PACKAGE_NAME}\` ${HARNESS_VERSION}.
- Agents should boot through \`AGENTS.md\`, \`status.md\`, \`index.yaml\`, and
  \`state/CONTEXT.md\`.
- \`status.md\` is current state, not a changelog.

## Next Work

- Fill in \`state/CONTEXT.md\` with repo-specific orientation.
- Keep \`index.yaml\` current as orientation-relevant files are added.
`,
      },
      {
        type: "file",
        path: "index.yaml",
        content: `repo: ${name}
description: Harnessed target repo.
updated: ${date}
harness:
  package: ${PACKAGE_NAME}
  version: ${HARNESS_VERSION}
  profile: ${profile}

orientation:
  purpose: >
    Give agents a small boot path and a reading order before they inspect the
    full repo.
  boot_order:
    - AGENTS.md
    - status.md
    - index.yaml
    - state/CONTEXT.md
  rule: Start with the boot_order, then read only the relevant deeper docs.

reading_order:
  - agents
  - status
  - context

documents:
  - doc_id: agents
    file: AGENTS.md
    title: Agent Instructions
    kind: operating-contract
    status: active
    summary: Agent boot sequence and status discipline for this repo.
    depends_on: []

  - doc_id: status
    file: status.md
    title: ${name} Status
    kind: state
    status: active
    summary: Current-state projection for this repo. Not a changelog.
    depends_on:
      - agents

  - doc_id: context
    file: state/CONTEXT.md
    title: ${name} Context Briefing
    kind: orientation
    status: active
    summary: Condensed briefing for fresh agents.
    depends_on:
      - agents
      - status
`,
      },
      {
        type: "file",
        path: "state/CONTEXT.md",
        content: `---
title: ${name} Context Briefing
generated_on: ${date}
generated_from:
  - AGENTS.md
  - status.md
  - index.yaml
harness:
  package: ${PACKAGE_NAME}
  version: ${HARNESS_VERSION}
  profile: ${profile}
---

# ${name} Context Briefing

This repo has the portable harness installed with the \`${profile}\` profile.

## Orientation rule

Fresh agents should read:

1. \`AGENTS.md\`
2. \`status.md\`
3. \`index.yaml\`
4. \`state/CONTEXT.md\`

Then inspect only the docs or files required for the task.

## Fill this in

Replace this section with a concise repo-specific briefing once the repo's
purpose, current state, and next work are known.
`,
      },
      {
        type: "file",
        path: ".harness/manifest.yaml",
        content: stringifyYaml(manifest),
      },
      ...moduleDefinitionEntries(modules),
      ...artifactPlan.entries,
    ];
  const lock = createLock({
    harness: manifest.harness,
    generatedAt: date,
    files: lockEntriesFromPlannedEntries(entries, manifest.harness),
  });

  entries.push({
    type: "file",
    path: ".harness/lock.yaml",
    content: stringifyYaml({ lock }),
  });

  return {
    errors: [],
    entries,
  };
}

export function runInit({ cwd = process.cwd(), args = [] } = {}) {
  if (args.includes("--help") || args.includes("-h")) {
    printInitHelp();
    return { ok: true };
  }

  const profile = argValue(args, "--profile", "minimal");
  const targetArg = argValue(args, "--target", cwd);
  const targetRoot = resolve(cwd, targetArg);
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const allowNonGit = args.includes("--allow-non-git");
  const date = todayIso();
  const errors = [];

  const plan = buildFiles({ targetRoot, profile, date });
  errors.push(...plan.errors);

  if (!allowNonGit && !existsSync(join(targetRoot, ".git"))) {
    errors.push(`${targetRoot}: target is not a git repo (pass --allow-non-git to override)`);
  }

  const existingArtifacts = errors.length === 0 ? collectExistingArtifacts(targetRoot, plan.entries) : [];
  const collisions = force ? [] : existingArtifacts;
  const overwrites = force ? existingArtifacts : [];
  const warnings = collisions.length > 0 ? [collisionWarning(collisions.length)] : [];

  if (dryRun && errors.length === 0) {
    printPlan({ targetRoot, profile, entries: plan.entries, dryRun, collisions, overwrites, warnings });
    console.log("");
    console.log("Harness init: dry run complete; no files written");
    return {
      ok: true,
      targetRoot,
      planned: plan.entries.map((entry) => entry.path),
      collisions,
      overwrites,
      warnings,
    };
  }

  if (errors.length === 0) {
    for (const file of collisions) {
      errors.push(`${file}: already exists (pass --force to overwrite)`);
    }
  }

  if (errors.length > 0) {
    printFailure(errors, warnings);
    return { ok: false, targetRoot, errors, warnings, collisions };
  }

  printPlan({ targetRoot, profile, entries: plan.entries, dryRun, overwrites });

  mkdirSync(targetRoot, { recursive: true });
  writePlannedEntries(targetRoot, plan.entries);

  console.log("");
  console.log(`Harness init: installed ${plan.entries.length} artifact(s)`);
  const doctor = runDoctor({ cwd: targetRoot });
  return {
    ok: doctor.ok,
    targetRoot,
    errors: doctor.diagnostics.errors,
    warnings: doctor.diagnostics.warnings,
    overwrites,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runInit({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
