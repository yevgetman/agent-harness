import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctor } from "./doctor.mjs";

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

function printInitHelp() {
  console.log(`harness init

Usage:
  harness init [--profile minimal] [--target <path>] [--force] [--dry-run]

Options:
  --profile minimal     Install the minimal process-domain profile.
  --target <path>       Target repository root. Defaults to the current dir.
  --force               Overwrite existing managed files.
  --dry-run             Print the install plan without writing files.
  --allow-non-git       Permit installation into a directory without .git.
  -h, --help            Show this help.
`);
}

function collectCollisions(targetRoot, planned, force) {
  if (force) return [];
  return planned
    .map((file) => file.path)
    .filter((file) => existsSync(join(targetRoot, file)));
}

function writePlannedFiles(targetRoot, planned) {
  for (const file of planned) {
    const outPath = join(targetRoot, file.path);
    ensureParent(outPath);
    writeFileSync(outPath, file.content);
  }
}

function printPlan({ targetRoot, profile, files, dryRun, collisions = [] }) {
  const label = dryRun ? "dry-run plan" : "install plan";
  console.log(`Harness init: ${label}`);
  console.log(`target: ${targetRoot}`);
  console.log(`profile: ${profile}`);
  console.log(`files:`);
  for (const file of files) {
    console.log(`  ${file.path}`);
  }
  if (collisions.length > 0) {
    console.log(`collisions:`);
    for (const file of collisions) {
      console.log(`  ${file}`);
    }
  }
}

function printFailure(errors) {
  for (const error of errors) {
    console.error(`fail ${error}`);
  }
  console.error("");
  console.error(`Harness init: failed (${errors.length} error(s))`);
}

function buildFiles({ targetRoot, profile, date }) {
  const name = repoName(targetRoot);

  if (profile !== "minimal") {
    return {
      errors: [`unsupported profile '${profile}' (supported: minimal)`],
      files: [],
    };
  }

  return {
    errors: [],
    files: [
      {
        path: "AGENTS.md",
        content: `# Agent Instructions

Harness metadata:
- package: ${PACKAGE_NAME}
- version: ${HARNESS_VERSION}
- profile: ${profile}

This repo has the portable harness installed with the \`minimal\` profile.

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
`,
      },
      {
        path: "status.md",
        content: `# ${name} Status

Last updated: ${date}

## Current Phase

Harness installed with the \`minimal\` profile.

## Current Decisions

- The repo uses the portable harness minimal profile.
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

This repo has the portable harness installed with the \`minimal\` profile.

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
        path: ".harness/manifest.yaml",
        content: `harness:
  manifest_version: 1
  installed_at: ${date}
  harness_version: ${HARNESS_VERSION}
  profile: ${profile}
  source:
    type: package
    package: ${PACKAGE_NAME}
    channel: dev
  modules:
    - id: agent-operating-contract
      version: 0.1.0
      status: active
      process_domains:
        - agent-operating-contract
    - id: progressive-orientation
      version: 0.1.0
      status: active
      process_domains:
        - progressive-orientation
  managed_files:
    - path: AGENTS.md
      owner: agent-operating-contract
      mode: merge
    - path: status.md
      owner: agent-operating-contract
      mode: merge
    - path: index.yaml
      owner: progressive-orientation
      mode: merge
    - path: state/CONTEXT.md
      owner: progressive-orientation
      mode: merge
  commands:
    doctor: harness doctor
    upgrade-plan: harness upgrade --plan
  upgrade:
    policy: plan-first
`,
      },
      {
        path: "modules/agent-operating-contract/module.yaml",
        content: readSource("modules/agent-operating-contract/module.yaml"),
      },
      {
        path: "modules/progressive-orientation/module.yaml",
        content: readSource("modules/progressive-orientation/module.yaml"),
      },
    ],
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

  const collisions = errors.length === 0 ? collectCollisions(targetRoot, plan.files, force) : [];

  if (dryRun && errors.length === 0) {
    printPlan({ targetRoot, profile, files: plan.files, dryRun, collisions });
    console.log("");
    console.log("Harness init: dry run complete; no files written");
    return {
      ok: true,
      targetRoot,
      planned: plan.files.map((file) => file.path),
      collisions,
    };
  }

  if (errors.length === 0) {
    for (const file of collisions) {
      errors.push(`${file}: already exists (pass --force to overwrite)`);
    }
  }

  if (errors.length > 0) {
    printFailure(errors);
    return { ok: false, targetRoot, errors };
  }

  printPlan({ targetRoot, profile, files: plan.files, dryRun });

  mkdirSync(targetRoot, { recursive: true });
  writePlannedFiles(targetRoot, plan.files);

  console.log("");
  console.log(`Harness init: installed ${plan.files.length} file(s)`);
  const doctor = runDoctor({ cwd: targetRoot });
  return { ok: doctor.ok, targetRoot, errors: doctor.diagnostics.errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runInit({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
