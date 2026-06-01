#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_PROFILES = ["minimal", "full"];
const REGISTRY_ACCESS = "public";
const COMMAND_MAX_BUFFER = 1024 * 1024;
const REQUIRED_PACKAGE_FILES = [
  "package.json",
  "scripts/harness.mjs",
  "scripts/init.mjs",
  "scripts/destroy.mjs",
  "scripts/doctor.mjs",
  "scripts/capture.mjs",
  "scripts/legibility.mjs",
  "scripts/reports.mjs",
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
  "scripts/memory.mjs",
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
  "modules/durable-memory/module.yaml",
  "modules/durable-memory/templates/README.md",
  "modules/durable-memory/templates/operator-preferences.yaml",
  "modules/durable-memory/templates/repo-notes.md",
  "modules/durable-memory/templates/session-summaries.md",
  "modules/capture-triage/module.yaml",
  "modules/capture-triage/templates/README.md",
  "modules/capture-triage/templates/inbox.yaml",
  "modules/capture-triage/templates/triage.yaml",
  "modules/application-corpus-legibility/module.yaml",
  "modules/application-corpus-legibility/templates/README.md",
  "modules/application-corpus-legibility/templates/inventory.yaml",
  "modules/application-corpus-legibility/templates/notes.md",
  "modules/reports-retrieval/module.yaml",
  "modules/reports-retrieval/templates/README.md",
  "modules/reports-retrieval/templates/catalog.yaml",
  "modules/reports-retrieval/templates/snapshots.md",
  "profiles/minimal.yaml",
  "profiles/full.yaml",
  "docs/install.md",
  "docs/minimal-profile.md",
  "docs/v1-validation.md",
  "design/v1-distribution-readiness-design.md",
];
const FORBIDDEN_PACKAGE_PREFIXES = [
  ".harness/",
  "build/",
  "capture/",
  "decisions/",
  "fixtures/",
  "invariants/",
  "legibility/",
  "memory/",
  "metadata/",
  "plans/",
  "reports/",
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
    maxBuffer: COMMAND_MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function runCaptured(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: COMMAND_MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
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
  harness distribution release --plan [--json]
  harness distribution publish --plan [--json]
  harness distribution publish --confirm [--json]
  harness distribution smoke [--profile <profile>] [--target <path>] [--force] [--json] [--keep]
  harness distribution global-smoke [--profile <profile>] [--json] [--keep]

Commands:
  check         Validate explicit npm package contents without writing a tarball.
  release       Plan release readiness without publishing.
  publish       Run the guarded npm publish workflow. Requires --plan or --confirm.
  smoke         Pack the local npm package and validate installed target repos.
  global-smoke  Install the packed package into a temporary global npm prefix and run harness from a target repo.

Options:
  --profile <profile>  Profile to smoke. May be repeated. Defaults to minimal and full.
  --target <path>      Existing git target repo to copy into the smoke workspace. May be repeated.
  --force              Pass compatibility --force to harness init inside the temporary smoke target.
  --json               Emit JSON result.
  --keep               Keep the temporary smoke directory for debugging.
`);
}

function repeatedArg(args, flag) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && i + 1 < args.length) {
      values.push(args[i + 1]);
      i += 1;
    }
  }
  return values;
}

function profileArgs(args, defaults = DEFAULT_PROFILES) {
  const profiles = [];
  profiles.push(...repeatedArg(args, "--profile"));
  return profiles.length > 0 ? profiles : defaults;
}

function targetArgs(args) {
  return repeatedArg(args, "--target").map((target) => resolve(process.cwd(), target));
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

function readPackageJson() {
  return JSON.parse(readFileSync(join(SOURCE_ROOT, "package.json"), "utf8"));
}

function publishCommandArgs(packageJson, { dryRun = false } = {}) {
  const args = ["publish", "--json"];
  if (dryRun) args.push("--dry-run");
  if (REGISTRY_ACCESS === "public" && packageJson.name?.startsWith("@")) {
    args.push("--access", "public");
  }
  return args;
}

function npmWarnings(stderr) {
  return stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("npm warn"));
}

function parsePublishOutput(stdout, label) {
  let publish = null;
  const errors = [];

  if (stdout.trim()) {
    try {
      publish = JSON.parse(stdout);
    } catch (parseError) {
      errors.push(`${label} JSON parse error: ${parseError.message}`);
    }
  } else {
    errors.push(`${label} did not emit JSON output`);
  }

  return { publish, errors };
}

function publishDryRun(packageJson = readPackageJson()) {
  const args = publishCommandArgs(packageJson, { dryRun: true });
  const result = runCaptured("npm", args, { cwd: SOURCE_ROOT });
  const { publish, errors } = parsePublishOutput(result.stdout, "npm publish --dry-run");

  if (result.error) {
    errors.push(result.error);
  }

  return {
    ok: result.ok && errors.length === 0,
    status: result.status,
    command: ["npm", ...args],
    access: REGISTRY_ACCESS,
    package_name: publish?.name ?? "unknown",
    package_version: publish?.version ?? "unknown",
    file_count: publish?.entryCount ?? 0,
    files: (publish?.files ?? []).map((file) => file.path).sort(),
    warnings: npmWarnings(result.stderr),
    errors,
  };
}

function publishActual(packageJson = readPackageJson()) {
  const args = publishCommandArgs(packageJson);
  const result = runCaptured("npm", args, { cwd: SOURCE_ROOT });
  const { publish, errors } = parsePublishOutput(result.stdout, "npm publish");

  if (result.error) {
    errors.push(result.error);
  }

  return {
    ok: result.ok && errors.length === 0,
    status: result.status,
    command: ["npm", ...args],
    access: REGISTRY_ACCESS,
    package_name: publish?.name ?? packageJson.name ?? "unknown",
    package_version: publish?.version ?? packageJson.version ?? "unknown",
    file_count: publish?.entryCount ?? 0,
    warnings: npmWarnings(result.stderr),
    errors,
  };
}

function validateExternalTargets(targets) {
  const errors = [];
  for (const target of targets) {
    if (!existsSync(target)) {
      errors.push(`${target}: target does not exist`);
      continue;
    }
    if (!statSync(target).isDirectory()) {
      errors.push(`${target}: target is not a directory`);
      continue;
    }
    if (!existsSync(join(target, ".git"))) {
      errors.push(`${target}: target is not a git repo`);
    }
  }
  return errors;
}

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function copyExternalTarget({ source, destination }) {
  const excluded = new Set([".git", "node_modules"]);
  cpSync(source, destination, {
    recursive: true,
    filter: (entry) => {
      const rel = relative(source, entry);
      if (!rel) return true;
      return !excluded.has(rel.split(/[\\/]/)[0]);
    },
  });
  run("git", ["init"], { cwd: destination });
}

function ensurePackageJson(target) {
  if (!existsSync(join(target, "package.json"))) {
    run("npm", ["init", "-y"], { cwd: target });
  }
}

function smokeProfile({ workRoot, tarball, profile, targetSource = null, targetIndex = null, forceInit = false }) {
  const target = targetSource
    ? join(workRoot, `target-${targetIndex}-${safeName(basename(targetSource))}-${safeName(profile)}`)
    : join(workRoot, `target-${safeName(profile)}`);

  try {
    if (targetSource) {
      copyExternalTarget({ source: targetSource, destination: target });
    } else {
      mkdirSync(target, { recursive: true });
      run("git", ["init"], { cwd: target });
    }
    ensurePackageJson(target);
    run("npm", ["install", tarball, "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: target });

    const harnessBin = join(target, "node_modules", ".bin", "harness");
    if (!existsSync(harnessBin)) {
      return {
        profile,
        target_source: targetSource,
        force_init: forceInit,
        target,
        ok: false,
        errors: [`${harnessBin}: installed harness binary is missing`],
      };
    }

    const initArgs = ["init", "--profile", profile, "--target", "."];
    if (forceInit) {
      initArgs.push("--force");
    }
    run(harnessBin, initArgs, { cwd: target });
    run(harnessBin, ["doctor"], { cwd: target });
    const plan = JSON.parse(run(harnessBin, ["upgrade", "--plan", "--json"], { cwd: target }));
    const errors = [];

    if (plan.version_source?.type !== "package") {
      errors.push(`upgrade plan version_source.type is '${plan.version_source?.type ?? "missing"}', expected 'package'`);
    }

    if (plan.upgrade_guidance?.model !== "installed-instance") {
      errors.push(`upgrade guidance model is '${plan.upgrade_guidance?.model ?? "missing"}', expected 'installed-instance'`);
    }

    for (const blocker of plan.blockers ?? []) {
      errors.push(`upgrade blocker: ${blocker}`);
    }

    for (const warning of plan.warnings ?? []) {
      errors.push(`upgrade warning: ${warning}`);
    }

    return {
      profile,
      target_source: targetSource,
      force_init: forceInit,
      target,
      ok: errors.length === 0,
      errors,
      version_source: plan.version_source,
      upgrade_guidance: plan.upgrade_guidance,
      managed_files: plan.managed_files?.length ?? 0,
      commands: plan.commands?.length ?? 0,
    };
  } catch (error) {
    return {
      profile,
      target_source: targetSource,
      force_init: forceInit,
      target,
      ok: false,
      errors: [commandError(error)],
      version_source: null,
      upgrade_guidance: null,
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
  console.log(`force_init: ${result.force_init ? "yes" : "no"}`);
  console.log(`work_root: ${result.work_root}${result.kept ? "" : " (removed)"}`);
  if ((result.external_targets ?? []).length > 0) {
    console.log("external_targets:");
    for (const target of result.external_targets) {
      console.log(`  ${target}`);
    }
  }
  console.log("profiles:");
  for (const profile of result.profiles) {
    console.log(`  ${profile.profile}: ${profile.ok ? "ok" : "error"}`);
    if (profile.target_source) {
      console.log(`    target_source: ${profile.target_source}`);
    }
    console.log(`    version_source: ${profile.version_source?.type ?? "unknown"}`);
    console.log(`    upgrade_model: ${profile.upgrade_guidance?.model ?? "unknown"}`);
    console.log(`    managed_files: ${profile.managed_files}`);
    console.log(`    commands: ${profile.commands}`);
    for (const error of profile.errors) {
      console.log(`    error: ${error}`);
    }
  }
}

function printGlobalSmokeResult(result) {
  console.log("Harness distribution global smoke");
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  console.log(`package: ${result.package_name}@${result.package_version}`);
  console.log(`tarball_entries: ${result.file_count}`);
  console.log(`package_check: ${result.package_check?.ok ? "ok" : "error"}`);
  console.log(`work_root: ${result.work_root}${result.kept ? "" : " (removed)"}`);
  console.log(`prefix: ${result.prefix}`);
  console.log(`harness_bin: ${result.harness_bin ?? "missing"}`);
  console.log("profiles:");
  for (const profile of result.profiles ?? []) {
    console.log(`  ${profile.profile}: ${profile.ok ? "ok" : "error"}`);
    console.log(`    default_init: ${profile.default_init ? "yes" : "no"}`);
    console.log(`    target: ${profile.target}`);
    console.log(`    plan_profile: ${profile.plan_profile ?? "unknown"}`);
    console.log(`    upgrade_apply: ${profile.upgrade_apply_ok ? "ok" : "error"}`);
    for (const error of profile.errors ?? []) {
      console.log(`    error: ${error}`);
    }
  }
  for (const error of result.errors ?? []) {
    console.log(`error: ${error}`);
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

function printReleasePlan(result) {
  console.log("Harness distribution release plan");
  console.log(`status: ${result.ready ? "ready" : "blocked"}`);
  console.log(`package: ${result.package_name}@${result.package_version}`);
  console.log(`registry_access: ${result.access}`);
  console.log(`private: ${result.private}`);
  console.log(`package_check: ${result.package_check.ok ? "ok" : "error"}`);
  console.log(`publish_dry_run: ${result.publish_dry_run.ok ? "ok" : "error"}`);
  console.log(`tarball_entries: ${result.file_count}`);
  console.log("blockers:");
  if (result.blockers.length === 0) {
    console.log("  none");
  } else {
    for (const blocker of result.blockers) {
      console.log(`  ${blocker}`);
    }
  }
  console.log("warnings:");
  if (result.warnings.length === 0) {
    console.log("  none");
  } else {
    for (const warning of result.warnings) {
      console.log(`  ${warning}`);
    }
  }
  console.log("next_actions:");
  for (const action of result.next_actions) {
    console.log(`  ${action}`);
  }
}

function printPublishResult(result) {
  console.log("Harness distribution publish");
  console.log(`mode: ${result.mode}`);
  console.log(`status: ${result.ready ? "ready" : "blocked"}`);
  console.log(`package: ${result.package_name}@${result.package_version}`);
  console.log(`registry_access: ${result.access}`);
  console.log(`published: ${result.published ? "yes" : "no"}`);
  console.log("blockers:");
  if (result.blockers.length === 0) {
    console.log("  none");
  } else {
    for (const blocker of result.blockers) {
      console.log(`  ${blocker}`);
    }
  }
  console.log("warnings:");
  if (result.warnings.length === 0) {
    console.log("  none");
  } else {
    for (const warning of result.warnings) {
      console.log(`  ${warning}`);
    }
  }
  console.log("next_actions:");
  for (const action of result.next_actions) {
    console.log(`  ${action}`);
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

function runReleasePlan() {
  const packageJson = readPackageJson();
  const check = runCheck();
  const publish = publishDryRun(packageJson);
  const blockers = [];
  const warnings = [];

  if (!check.ok) {
    blockers.push(...check.errors);
  }

  if (!publish.ok) {
    blockers.push(...publish.errors);
  }

  if (packageJson.private === true) {
    blockers.push("package.json private is true; registry publication is intentionally blocked");
  }

  if (REGISTRY_ACCESS === "public" && packageJson.license === "UNLICENSED") {
    blockers.push("package.json license is UNLICENSED; public registry publication requires a release license decision");
  }

  if (!packageJson.repository?.url) {
    blockers.push("package.json missing repository.url");
  }

  if (!packageJson.license) {
    blockers.push("package.json missing license");
  }

  if (!packageJson.engines?.node) {
    blockers.push("package.json missing engines.node");
  }

  const autoCorrectWarning = publish.warnings.find((warning) => warning.includes("auto-corrected"));
  if (autoCorrectWarning) {
    blockers.push("npm publish --dry-run auto-corrected package metadata");
  }

  warnings.push(...publish.warnings.filter((warning) => !warning.includes("requires you to be logged in")));

  return {
    ok: check.ok && publish.ok,
    ready: blockers.length === 0,
    package_name: check.package_name,
    package_version: check.package_version,
    access: REGISTRY_ACCESS,
    private: packageJson.private === true,
    file_count: check.file_count,
    package_check: check.package_check,
    publish_dry_run: publish,
    blockers,
    warnings,
    next_actions: [
      "keep npm registry access public unless package scope or release policy changes",
      "choose a release license before public registry publication",
      "set package.json private to false only after a release decision",
      "rerun npm run distribution:release-plan before any publish attempt",
    ],
  };
}

function runPublish(args) {
  const wantsPlan = args.includes("--plan");
  const wantsConfirm = args.includes("--confirm");

  if (wantsPlan === wantsConfirm) {
    return {
      ok: false,
      mode: wantsConfirm ? "invalid" : "missing",
      ready: false,
      package_name: "unknown",
      package_version: "unknown",
      access: REGISTRY_ACCESS,
      published: false,
      release_plan: null,
      publish: null,
      blockers: ["distribution publish requires exactly one of --plan or --confirm"],
      warnings: [],
      next_actions: ["rerun with --plan to inspect readiness or --confirm to publish a ready release"],
    };
  }

  const releasePlan = runReleasePlan();
  const result = {
    ok: wantsPlan ? releasePlan.ok : false,
    mode: wantsConfirm ? "confirm" : "plan",
    ready: releasePlan.ready,
    package_name: releasePlan.package_name,
    package_version: releasePlan.package_version,
    access: releasePlan.access,
    published: false,
    release_plan: releasePlan,
    publish: null,
    blockers: [...releasePlan.blockers],
    warnings: [...releasePlan.warnings],
    next_actions: releasePlan.ready
      ? ["rerun harness distribution publish --confirm to publish this ready release"]
      : releasePlan.next_actions,
  };

  if (wantsPlan) {
    return result;
  }

  if (!releasePlan.ready) {
    return result;
  }

  const publish = publishActual(readPackageJson());
  return {
    ...result,
    ok: publish.ok,
    published: publish.ok,
    publish,
    blockers: publish.ok ? [] : publish.errors,
    warnings: [...result.warnings, ...publish.warnings],
    next_actions: publish.ok
      ? ["verify registry version discovery reports the published version"]
      : ["resolve npm publish errors and rerun harness distribution publish --plan"],
  };
}

function runSmoke(args) {
  const keep = args.includes("--keep");
  const forceInit = args.includes("--force");
  const externalTargets = targetArgs(args);
  const profilesToSmoke = profileArgs(args, externalTargets.length > 0 ? ["minimal"] : DEFAULT_PROFILES);
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
        external_targets: externalTargets,
        force_init: forceInit,
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
        external_targets: externalTargets,
        force_init: forceInit,
        profiles: [],
        errors: packageCheck.errors,
      };
      return result;
    }

    const targetErrors = validateExternalTargets(externalTargets);
    if (targetErrors.length > 0) {
      result = {
        ok: false,
        work_root: workRoot,
        kept: keep,
        package_name: packed.package_name,
        package_version: packed.package_version,
        file_count: packed.file_count,
        package_check: packageCheck,
        external_targets: externalTargets,
        force_init: forceInit,
        profiles: [],
        errors: targetErrors,
      };
      return result;
    }

    const smokeRuns = externalTargets.length > 0
      ? externalTargets.flatMap((target, targetIndex) =>
        profilesToSmoke.map((profile) => ({ profile, targetSource: target, targetIndex, forceInit })),
      )
      : profilesToSmoke.map((profile) => ({ profile, targetSource: null, targetIndex: null, forceInit }));
    const profiles = smokeRuns.map((runSpec) =>
      smokeProfile({ workRoot, tarball: packed.tarball, ...runSpec }),
    );
    result = {
      ok: profiles.every((profile) => profile.ok),
      work_root: workRoot,
      kept: keep,
      package_name: packed.package_name,
      package_version: packed.package_version,
      file_count: packed.file_count,
      package_check: packageCheck,
      external_targets: externalTargets,
      force_init: forceInit,
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

function globalSmokeProfile({ harnessBin, workRoot, profile, defaultInit }) {
  const target = join(workRoot, `global-target-${safeName(profile)}`);
  try {
    mkdirSync(target, { recursive: true });
    run("git", ["init"], { cwd: target });

    const initArgs = defaultInit ? ["init"] : ["init", "--profile", profile];
    run(harnessBin, initArgs, { cwd: target });
    run(harnessBin, ["doctor"], { cwd: target });
    const plan = JSON.parse(run(harnessBin, ["upgrade", "--plan", "--json"], { cwd: target }));
    const upgradeApply = runCaptured(harnessBin, ["upgrade"], { cwd: target });
    const errors = [];

    if (plan.profile !== profile) {
      errors.push(`upgrade plan profile is '${plan.profile ?? "missing"}', expected '${profile}'`);
    }
    if (plan.version_source?.type !== "package") {
      errors.push(`upgrade plan version_source.type is '${plan.version_source?.type ?? "missing"}', expected 'package'`);
    }
    if (!upgradeApply.ok) {
      errors.push(`harness upgrade failed: ${upgradeApply.stderr.trim() || upgradeApply.stdout.trim() || upgradeApply.error || `exit ${upgradeApply.status}`}`);
    }

    return {
      profile,
      default_init: defaultInit,
      target,
      ok: errors.length === 0,
      errors,
      plan_profile: plan.profile,
      version_source: plan.version_source,
      upgrade_apply_ok: upgradeApply.ok,
    };
  } catch (error) {
    return {
      profile,
      default_init: defaultInit,
      target,
      ok: false,
      errors: [commandError(error)],
      plan_profile: null,
      version_source: null,
      upgrade_apply_ok: false,
    };
  }
}

function runGlobalSmoke(args) {
  const keep = args.includes("--keep");
  const explicitProfiles = repeatedArg(args, "--profile");
  const profilesToSmoke = explicitProfiles.length > 0 ? explicitProfiles : ["full"];
  const workRoot = mkdtempSync(join(tmpdir(), "harness-global-smoke-"));
  const prefix = join(workRoot, "prefix");
  let result;

  try {
    const packed = packPackage(workRoot);
    if (packed.error) {
      result = {
        ok: false,
        work_root: workRoot,
        kept: keep,
        prefix,
        harness_bin: null,
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
    const harnessBin = join(prefix, "bin", "harness");
    if (!packageCheck.ok) {
      result = {
        ok: false,
        work_root: workRoot,
        kept: keep,
        prefix,
        harness_bin: harnessBin,
        package_name: packed.package_name,
        package_version: packed.package_version,
        file_count: packed.file_count,
        package_check: packageCheck,
        profiles: [],
        errors: packageCheck.errors,
      };
      return result;
    }

    run("npm", ["install", "-g", packed.tarball, "--prefix", prefix, "--no-audit", "--no-fund", "--ignore-scripts"], {
      cwd: workRoot,
    });
    if (!existsSync(harnessBin)) {
      result = {
        ok: false,
        work_root: workRoot,
        kept: keep,
        prefix,
        harness_bin: harnessBin,
        package_name: packed.package_name,
        package_version: packed.package_version,
        file_count: packed.file_count,
        package_check: packageCheck,
        profiles: [],
        errors: [`${harnessBin}: global harness binary is missing`],
      };
      return result;
    }

    const profiles = profilesToSmoke.map((profile) =>
      globalSmokeProfile({
        harnessBin,
        workRoot,
        profile,
        defaultInit: explicitProfiles.length === 0 && profile === "full",
      }),
    );

    result = {
      ok: profiles.every((profile) => profile.ok),
      work_root: workRoot,
      kept: keep,
      prefix,
      harness_bin: harnessBin,
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

  if (subcommand === "release") {
    if (!rest.includes("--plan")) {
      console.error("fail distribution release requires --plan");
      printHelp();
      return { ok: false };
    }

    const result = runReleasePlan();
    if (rest.includes("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printReleasePlan(result);
    }
    return result;
  }

  if (subcommand === "publish") {
    const result = runPublish(rest);
    if (rest.includes("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPublishResult(result);
    }
    return result;
  }

  if (subcommand === "global-smoke") {
    const result = runGlobalSmoke(rest);
    if (rest.includes("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printGlobalSmokeResult(result);
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
