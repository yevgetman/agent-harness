#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_PROFILES = ["minimal", "dogfood"];
const REQUIRED_PACKAGE_FILES = [
  "package.json",
  "scripts/harness.mjs",
  "scripts/init.mjs",
  "scripts/doctor.mjs",
  "scripts/modules.mjs",
  "scripts/profiles.mjs",
  "scripts/lock.mjs",
  "scripts/upgrade.mjs",
  "scripts/decisions.mjs",
  "scripts/questions.mjs",
  "scripts/metadata.mjs",
  "scripts/state.mjs",
  "scripts/invariants.mjs",
  "scripts/plans.mjs",
  "scripts/distribution.mjs",
  "modules/registry.yaml",
  "modules/agent-operating-contract/module.yaml",
  "modules/progressive-orientation/module.yaml",
  "modules/decisions-open-questions/module.yaml",
  "modules/decisions-open-questions/templates/decision.md",
  "modules/decisions-open-questions/templates/open-questions.yaml",
  "modules/structured-metadata/module.yaml",
  "modules/structured-metadata/templates/artifacts.yaml",
  "modules/canonical-state/module.yaml",
  "modules/canonical-state/templates/canonical-state.yaml",
  "modules/invariants-golden-principles/module.yaml",
  "modules/invariants-golden-principles/templates/golden-principles.yaml",
  "modules/plans-and-status/module.yaml",
  "modules/plans-and-status/templates/current.yaml",
  "profiles/minimal.yaml",
  "profiles/dogfood.yaml",
  "docs/install.md",
  "docs/minimal-profile.md",
  "design/v1-distribution-readiness-design.md",
];
const FORBIDDEN_PACKAGE_PREFIXES = [
  ".harness/",
  "build/",
  "decisions/",
  "fixtures/",
  "invariants/",
  "metadata/",
  "plans/",
  "spec/",
  "state/",
  "templates/",
];
const FORBIDDEN_PACKAGE_FILES = [
  "AGENTS.md",
  "index.yaml",
  "open-questions.yaml",
  "package-lock.json",
  "status.md",
  "scripts/test.mjs",
];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function commandError(error) {
  const stderr = error.stderr?.toString?.().trim();
  const stdout = error.stdout?.toString?.().trim();
  return stderr || stdout || error.message;
}

function printHelp() {
  console.log(`harness distribution

Usage:
  harness distribution check [--json]
  harness distribution smoke [--profile <profile>] [--json] [--keep]

Commands:
  check    Validate explicit npm package contents without writing a tarball.
  smoke    Pack the local npm package and validate installed target repos.

Options:
  --profile <profile>  Profile to smoke. May be repeated. Defaults to minimal and dogfood.
  --json               Emit JSON result.
  --keep               Keep the temporary smoke directory for debugging.
`);
}

function profileArgs(args) {
  const profiles = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--profile" && i + 1 < args.length) {
      profiles.push(args[i + 1]);
      i += 1;
    }
  }
  return profiles.length > 0 ? profiles : DEFAULT_PROFILES;
}

function validatePackageFiles(files) {
  const fileSet = new Set(files);
  const errors = [];

  for (const file of REQUIRED_PACKAGE_FILES) {
    if (!fileSet.has(file)) {
      errors.push(`package is missing required file: ${file}`);
    }
  }

  for (const file of files) {
    if (FORBIDDEN_PACKAGE_FILES.includes(file)) {
      errors.push(`package includes repo-local file: ${file}`);
    }

    const forbiddenPrefix = FORBIDDEN_PACKAGE_PREFIXES.find((prefix) => file.startsWith(prefix));
    if (forbiddenPrefix) {
      errors.push(`package includes repo-local path '${forbiddenPrefix}': ${file}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    required_files: REQUIRED_PACKAGE_FILES.length,
    forbidden_rules: FORBIDDEN_PACKAGE_PREFIXES.length + FORBIDDEN_PACKAGE_FILES.length,
  };
}

function packPackage(workRoot = null, { dryRun = false } = {}) {
  const args = ["pack", SOURCE_ROOT, "--json"];
  let packDir = null;
  if (dryRun) {
    args.push("--dry-run");
  } else {
    packDir = join(workRoot, "pack");
    mkdirSync(packDir, { recursive: true });
    args.push("--pack-destination", packDir);
  }

  const output = run("npm", args, {
    cwd: SOURCE_ROOT,
  });
  const packed = JSON.parse(output);
  const filename = packed?.[0]?.filename;
  if (!filename) {
    return { error: "npm pack did not report a tarball filename" };
  }

  let tarball = null;
  if (!dryRun) {
    tarball = join(packDir, filename);
    if (!existsSync(tarball)) {
      return { error: `${tarball}: packed tarball is missing` };
    }
  }

  const files = (packed[0].files ?? []).map((file) => file.path).sort();
  return {
    tarball,
    package_name: packed[0].name,
    package_version: packed[0].version,
    file_count: packed[0].entryCount,
    files,
  };
}

function smokeProfile({ workRoot, tarball, profile }) {
  const target = join(workRoot, `target-${profile}`);
  mkdirSync(target, { recursive: true });

  try {
    run("git", ["init"], { cwd: target });
    run("npm", ["init", "-y"], { cwd: target });
    run("npm", ["install", tarball, "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: target });

    const harnessBin = join(target, "node_modules", ".bin", "harness");
    if (!existsSync(harnessBin)) {
      return {
        profile,
        target,
        ok: false,
        errors: [`${harnessBin}: installed harness binary is missing`],
      };
    }

    run(harnessBin, ["init", "--profile", profile, "--target", "."], { cwd: target });
    run(harnessBin, ["doctor"], { cwd: target });
    const plan = JSON.parse(run(harnessBin, ["upgrade", "--plan", "--json"], { cwd: target }));
    const errors = [];

    if (plan.version_source?.type !== "package") {
      errors.push(`upgrade plan version_source.type is '${plan.version_source?.type ?? "missing"}', expected 'package'`);
    }

    for (const blocker of plan.blockers ?? []) {
      errors.push(`upgrade blocker: ${blocker}`);
    }

    for (const warning of plan.warnings ?? []) {
      errors.push(`upgrade warning: ${warning}`);
    }

    return {
      profile,
      target,
      ok: errors.length === 0,
      errors,
      version_source: plan.version_source,
      managed_files: plan.managed_files?.length ?? 0,
      commands: plan.commands?.length ?? 0,
    };
  } catch (error) {
    return {
      profile,
      target,
      ok: false,
      errors: [commandError(error)],
      version_source: null,
      managed_files: 0,
      commands: 0,
    };
  }
}

function printResult(result) {
  console.log("Harness distribution smoke");
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  console.log(`package: ${result.package_name}@${result.package_version}`);
  console.log(`tarball_entries: ${result.file_count}`);
  console.log(`package_check: ${result.package_check?.ok ? "ok" : "error"}`);
  console.log(`work_root: ${result.work_root}${result.kept ? "" : " (removed)"}`);
  console.log("profiles:");
  for (const profile of result.profiles) {
    console.log(`  ${profile.profile}: ${profile.ok ? "ok" : "error"}`);
    console.log(`    version_source: ${profile.version_source?.type ?? "unknown"}`);
    console.log(`    managed_files: ${profile.managed_files}`);
    console.log(`    commands: ${profile.commands}`);
    for (const error of profile.errors) {
      console.log(`    error: ${error}`);
    }
  }
}

function printCheckResult(result) {
  console.log("Harness distribution check");
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  console.log(`package: ${result.package_name}@${result.package_version}`);
  console.log(`tarball_entries: ${result.file_count}`);
  console.log(`required_files: ${result.package_check.required_files}`);
  console.log(`forbidden_rules: ${result.package_check.forbidden_rules}`);
  for (const error of result.errors) {
    console.log(`error: ${error}`);
  }
}

function runCheck() {
  const packed = packPackage(null, { dryRun: true });
  if (packed.error) {
    return {
      ok: false,
      package_name: "unknown",
      package_version: "unknown",
      file_count: 0,
      files: [],
      package_check: {
        ok: false,
        errors: [packed.error],
        required_files: REQUIRED_PACKAGE_FILES.length,
        forbidden_rules: FORBIDDEN_PACKAGE_PREFIXES.length + FORBIDDEN_PACKAGE_FILES.length,
      },
      errors: [packed.error],
    };
  }

  const packageCheck = validatePackageFiles(packed.files);
  return {
    ok: packageCheck.ok,
    package_name: packed.package_name,
    package_version: packed.package_version,
    file_count: packed.file_count,
    files: packed.files,
    package_check: packageCheck,
    errors: packageCheck.errors,
  };
}

function runSmoke(args) {
  const keep = args.includes("--keep");
  const workRoot = mkdtempSync(join(tmpdir(), "harness-distribution-smoke-"));
  let result;

  try {
    const packed = packPackage(workRoot);
    if (packed.error) {
      result = {
        ok: false,
        work_root: workRoot,
        kept: keep,
        package_name: "unknown",
        package_version: "unknown",
        file_count: 0,
        package_check: {
          ok: false,
          errors: [packed.error],
          required_files: REQUIRED_PACKAGE_FILES.length,
          forbidden_rules: FORBIDDEN_PACKAGE_PREFIXES.length + FORBIDDEN_PACKAGE_FILES.length,
        },
        profiles: [],
        errors: [packed.error],
      };
      return result;
    }

    const packageCheck = validatePackageFiles(packed.files);
    if (!packageCheck.ok) {
      result = {
        ok: false,
        work_root: workRoot,
        kept: keep,
        package_name: packed.package_name,
        package_version: packed.package_version,
        file_count: packed.file_count,
        package_check: packageCheck,
        profiles: [],
        errors: packageCheck.errors,
      };
      return result;
    }

    const profiles = profileArgs(args).map((profile) =>
      smokeProfile({ workRoot, tarball: packed.tarball, profile }),
    );
    result = {
      ok: profiles.every((profile) => profile.ok),
      work_root: workRoot,
      kept: keep,
      package_name: packed.package_name,
      package_version: packed.package_version,
      file_count: packed.file_count,
      package_check: packageCheck,
      profiles,
      errors: profiles.flatMap((profile) => profile.errors),
    };
    return result;
  } finally {
    if (!keep) {
      rmSync(workRoot, { recursive: true, force: true });
    }
  }
}

export function runDistribution({ args = [] } = {}) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return { ok: true };
  }

  if (subcommand === "check") {
    const result = runCheck();
    if (rest.includes("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printCheckResult(result);
    }
    return result;
  }

  if (subcommand !== "smoke") {
    console.error(`fail unknown distribution command '${subcommand}'`);
    printHelp();
    return { ok: false };
  }

  const result = runSmoke(rest);
  if (rest.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printResult(result);
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runDistribution({ args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
