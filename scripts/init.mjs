import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { runDoctor } from "./doctor.mjs";
import { createLockFromManifest, sha256, writeLock } from "./lock.mjs";
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
  --profile <profile>   Install a profile from profiles/. Defaults to full.
  --target <path>       Target repository root. Defaults to the current dir.
  --force               Deprecated compatibility flag; init remains merge-safe.
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
  return `${count} planned harness artifact(s) already exist; init will merge harness sections or refresh harness-owned lifecycle state`;
}

function forceWarning() {
  return "--force is accepted for compatibility, but init no longer overwrites human-authored content";
}

function markerId(path) {
  return path
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function markerStart(path) {
  return `<!-- harness:start ${markerId(path)} -->`;
}

function markerEnd(path) {
  return `<!-- harness:end ${markerId(path)} -->`;
}

function markerPattern(path) {
  const start = markerStart(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = markerEnd(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${start}[\\s\\S]*?${end}`);
}

function stripLeadingHeading(markdown) {
  return markdown.replace(/^# .*\n+/, "").trim();
}

function stripFrontmatter(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n+/, "");
}

function sectionForMarkdown(path, incomingContent) {
  const existingSection = incomingContent.match(markerPattern(path))?.[0];
  if (existingSection) return existingSection;

  if (path === "state/CONTEXT.md") {
    return `${markerStart(path)}
${stripLeadingHeading(stripFrontmatter(incomingContent))}
${markerEnd(path)}`;
  }

  return `${markerStart(path)}
${stripLeadingHeading(incomingContent)}
${markerEnd(path)}`;
}

function mergeMarkedMarkdown(path, existingContent, incomingContent) {
  const section = sectionForMarkdown(path, incomingContent);
  const pattern = markerPattern(path);

  if (pattern.test(existingContent)) {
    return {
      ok: true,
      content: `${existingContent.replace(pattern, section).replace(/\s+$/, "")}\n`,
      action: "updated-section",
    };
  }

  return {
    ok: true,
    content: `${existingContent.replace(/\s+$/, "")}\n\n${section}\n`,
    action: "appended-section",
  };
}

function byId(list, key) {
  const output = [];
  const seen = new Set();

  for (const item of Array.isArray(list) ? list : []) {
    const id = item?.[key];
    if (id) seen.add(id);
    output.push(item);
  }

  return { output, seen };
}

function mergeObjects(existing, incoming) {
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) return incoming;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return existing;
  return { ...incoming, ...existing };
}

function mergeListByKey(existingList, incomingList, key) {
  if (!key) {
    const output = Array.isArray(existingList) ? [...existingList] : [];
    const seen = new Set(output);
    for (const item of Array.isArray(incomingList) ? incomingList : []) {
      if (seen.has(item)) continue;
      output.push(item);
      seen.add(item);
    }
    return output;
  }

  const { output, seen } = byId(existingList, key);
  for (const item of Array.isArray(incomingList) ? incomingList : []) {
    const id = item?.[key];
    if (!id || seen.has(id)) continue;
    output.push(item);
    seen.add(id);
  }
  return output;
}

function parseYamlContent(path, content) {
  try {
    return { value: parseYaml(content) };
  } catch (error) {
    return { error: `${path}: cannot merge existing YAML safely: ${error.message}` };
  }
}

function mergeIndexYaml(existing, incoming) {
  const merged = mergeObjects(existing, incoming);
  merged.harness = incoming.harness;
  merged.orientation = mergeObjects(existing.orientation, incoming.orientation);
  merged.orientation.boot_order = mergeListByKey(
    existing.orientation?.boot_order ?? [],
    incoming.orientation?.boot_order ?? [],
    null,
  );
  merged.reading_order = mergeListByKey(existing.reading_order ?? [], incoming.reading_order ?? [], null);
  merged.documents = mergeListByKey(existing.documents ?? [], incoming.documents ?? [], "doc_id");
  return merged;
}

function mergeYamlListRoot(existing, incoming, rootKey, listKey) {
  const merged = mergeObjects(existing, incoming);
  merged[rootKey] = mergeObjects(existing?.[rootKey], incoming?.[rootKey]);
  merged[rootKey][listKey] = mergeListByKey(
    existing?.[rootKey]?.[listKey] ?? [],
    incoming?.[rootKey]?.[listKey] ?? [],
    "id",
  );
  return merged;
}

function mergeYamlContent(path, existingContent, incomingContent) {
  const existing = parseYamlContent(path, existingContent);
  if (existing.error) return { ok: false, error: existing.error };
  const incoming = parseYamlContent(path, incomingContent);
  if (incoming.error) return { ok: false, error: incoming.error };

  if (path === "open-questions.yaml") {
    if (!Array.isArray(existing.value)) {
      return { ok: false, error: `${path}: existing file is not a top-level list; cannot merge safely` };
    }
    return { ok: true, content: existingContent, action: "preserved-yaml-list" };
  }

  let merged;
  if (path === "index.yaml") {
    merged = mergeIndexYaml(existing.value ?? {}, incoming.value ?? {});
  } else if (path === "metadata/artifacts.yaml") {
    merged = mergeYamlListRoot(existing.value ?? {}, incoming.value ?? {}, "metadata", "artifacts");
  } else if (path === "state/canonical-state.yaml") {
    merged = mergeYamlListRoot(existing.value ?? {}, incoming.value ?? {}, "canonical_state", "entries");
  } else if (path === "invariants/golden-principles.yaml") {
    merged = mergeYamlListRoot(existing.value ?? {}, incoming.value ?? {}, "invariants", "principles");
  } else if (path === "plans/current.yaml") {
    merged = mergeYamlListRoot(existing.value ?? {}, incoming.value ?? {}, "plans_status", "plans");
  } else {
    return { ok: true, content: existingContent, action: "preserved-existing" };
  }

  return { ok: true, content: stringifyYaml(merged), action: "merged-yaml" };
}

export function mergeManagedContent({ path, existingContent, incomingContent }) {
  if (["AGENTS.md", "status.md", "state/CONTEXT.md"].includes(path)) {
    return mergeMarkedMarkdown(path, existingContent, incomingContent);
  }

  if (path.endsWith(".yaml") || path.endsWith(".yml")) {
    return mergeYamlContent(path, existingContent, incomingContent);
  }

  return { ok: true, content: existingContent, action: "preserved-existing" };
}

function shouldReplaceExisting(path) {
  return path === ".harness/manifest.yaml" || /^modules\/[^/]+\/module\.ya?ml$/.test(path);
}

function writePlannedEntries(targetRoot, planned, { harness, date }) {
  const written = [];
  const merged = [];
  const preserved = [];
  const errors = [];

  for (const entry of planned) {
    if (entry.path === ".harness/lock.yaml") continue;

    const outPath = join(targetRoot, entry.path);
    if (entry.type === "directory") {
      mkdirSync(outPath, { recursive: true });
      written.push(entry.path);
      continue;
    }

    ensureParent(outPath);
    if (!existsSync(outPath) || shouldReplaceExisting(entry.path)) {
      writeFileSync(outPath, entry.content);
      written.push(entry.path);
      continue;
    }

    const mergedContent = mergeManagedContent({
      path: entry.path,
      existingContent: readFileSync(outPath, "utf8"),
      incomingContent: entry.content,
    });
    if (!mergedContent.ok) {
      errors.push(mergedContent.error);
      continue;
    }

    if (mergedContent.content !== readFileSync(outPath, "utf8")) {
      writeFileSync(outPath, mergedContent.content);
      merged.push(`${entry.path}: ${mergedContent.action}`);
    } else {
      preserved.push(`${entry.path}: ${mergedContent.action}`);
    }
  }

  if (errors.length === 0) {
    const generated = createLockFromManifest({
      root: targetRoot,
      harness,
      generatedAt: date,
      sourceRoot: SOURCE_ROOT,
    });
    if (generated.missing.length > 0) {
      errors.push(...generated.missing.map((path) => `${path}: expected lock path is missing`));
    } else {
      writeLock(targetRoot, generated.lock);
      written.push(".harness/lock.yaml");
    }
  }

  return { written, merged, preserved, errors };
}

function printPlan({ targetRoot, profile, entries, dryRun, existing = [], merges = [], preserved = [], warnings = [] }) {
  const label = dryRun ? "dry-run plan" : "install plan";
  console.log(`Harness init: ${label}`);
  console.log(`target: ${targetRoot}`);
  console.log(`profile: ${profile}`);
  if (entries.length > 0) {
    console.log(`files:`);
    for (const entry of entries) {
      console.log(`  ${entry.path}`);
    }
  }
  if (existing.length > 0) {
    console.log(`existing:`);
    for (const file of existing) {
      console.log(`  ${file}`);
    }
  }
  if (merges.length > 0) {
    console.log(`merged:`);
    for (const file of merges) console.log(`  ${file}`);
  }
  if (preserved.length > 0) {
    console.log(`preserved:`);
    for (const file of preserved) console.log(`  ${file}`);
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
    "profiles-inspect": "harness profiles inspect",
    "profiles-switch": "harness profiles switch",
    "profiles-sync": "harness profiles sync",
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
        registry_tag: "latest",
        install_model: "installed-instance",
      },
      modules: moduleRefsFor(modules),
      managed_files: managedFilesFor(modules),
      commands: commandsFor(modules),
      upgrade: {
        policy: "plan-first",
        model: "installed-instance",
      },
    },
  };

  const entries = [
      {
        type: "file",
        path: "AGENTS.md",
        content: `# Agent Instructions

${markerStart("AGENTS.md")}
## Harness Agent Instructions

Harness metadata:
- package: ${PACKAGE_NAME}
- version: ${HARNESS_VERSION}
- profile: ${profile}

This repo has the portable harness installed with the \`${profile}\` profile.

The harness source does not track this repo as an installation. Run harness
lifecycle commands inside this repo when inspecting, validating, or upgrading
its installed harness state.

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
${markerEnd("AGENTS.md")}
`,
      },
      {
        type: "file",
        path: "status.md",
        content: `# ${name} Status

${markerStart("status.md")}
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
${markerEnd("status.md")}
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

${markerStart("state/CONTEXT.md")}
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
${markerEnd("state/CONTEXT.md")}
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
  entries.push({
    type: "file",
    path: ".harness/lock.yaml",
    content: "# Generated after init writes current merged file state.\n",
  });

  return {
    errors: [],
    entries,
    harness: manifest.harness,
  };
}

export function runInit({ cwd = process.cwd(), args = [] } = {}) {
  if (args.includes("--help") || args.includes("-h")) {
    printInitHelp();
    return { ok: true };
  }

  const profile = argValue(args, "--profile", "full");
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
  const warnings = [
    ...(existingArtifacts.length > 0 ? [collisionWarning(existingArtifacts.length)] : []),
    ...(force ? [forceWarning()] : []),
  ];

  if (dryRun && errors.length === 0) {
    printPlan({ targetRoot, profile, entries: plan.entries, dryRun, existing: existingArtifacts, warnings });
    console.log("");
    console.log("Harness init: dry run complete; no files written");
    return {
      ok: true,
      targetRoot,
      planned: plan.entries.map((entry) => entry.path),
      existing: existingArtifacts,
      warnings,
      profile,
      default_profile: !args.includes("--profile"),
      merge_safe: true,
      force_deprecated: force,
      collisions: [],
      overwrites: [],
    };
  }

  if (errors.length > 0) {
    printFailure(errors, warnings);
    return {
      ok: false,
      targetRoot,
      errors,
      warnings,
      existing: existingArtifacts,
      collisions: [],
    };
  }

  printPlan({ targetRoot, profile, entries: plan.entries, dryRun, existing: existingArtifacts, warnings });

  mkdirSync(targetRoot, { recursive: true });
  const written = writePlannedEntries(targetRoot, plan.entries, { harness: plan.harness, date });

  if (written.errors.length > 0) {
    printFailure(written.errors, warnings);
    return {
      ok: false,
      targetRoot,
      errors: written.errors,
      warnings,
      existing: existingArtifacts,
      collisions: [],
      overwrites: [],
    };
  }

  if (written.merged.length > 0 || written.preserved.length > 0) {
    printPlan({
      targetRoot,
      profile,
      entries: [],
      dryRun: false,
      merges: written.merged,
      preserved: written.preserved,
    });
  }

  console.log("");
  console.log(`Harness init: installed ${plan.entries.length} artifact(s)`);
  const doctor = runDoctor({ cwd: targetRoot });
  return {
    ok: doctor.ok,
    targetRoot,
    errors: doctor.diagnostics.errors,
    warnings: [...warnings, ...doctor.diagnostics.warnings],
    existing: existingArtifacts,
    merged: written.merged,
    preserved: written.preserved,
    written: written.written,
    profile,
    default_profile: !args.includes("--profile"),
    merge_safe: true,
    force_deprecated: force,
    collisions: [],
    overwrites: [],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runInit({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
