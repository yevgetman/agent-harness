import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { loadSourceModule, planModuleInstall } from "./modules.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(SCRIPT_DIR, "..");

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function missingFlagValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && (i + 1 >= args.length || args[i + 1].startsWith("--"));
}

function positionalArgs(args) {
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--target") {
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) continue;
    positional.push(arg);
  }
  return positional;
}

function profilesDir(sourceRoot) {
  return join(sourceRoot, "profiles");
}

export function loadProfiles(sourceRoot = SOURCE_ROOT) {
  const dir = profilesDir(sourceRoot);
  if (!existsSync(dir)) {
    return { profiles: [], errors: ["profiles/: missing"] };
  }

  const profiles = [];
  const errors = [];
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .sort();

  for (const file of files) {
    const path = join(dir, file);
    let yaml;
    try {
      yaml = readYamlFile(path);
    } catch (parseError) {
      errors.push(`profiles/${file}: YAML parse error: ${parseError.message}`);
      continue;
    }

    const profile = yaml?.profile;
    if (!profile?.id) {
      errors.push(`profiles/${file}: missing profile.id`);
      continue;
    }

    profiles.push({
      id: profile.id,
      status: profile.status ?? "unknown",
      modules: Array.isArray(profile.modules) ? profile.modules : [],
      path: `profiles/${file}`,
    });
  }

  return { profiles, errors };
}

export function loadProfile(profileId, sourceRoot = SOURCE_ROOT) {
  const loaded = loadProfiles(sourceRoot);
  if (loaded.errors.length > 0) return { error: loaded.errors.join("; ") };

  const profile = loaded.profiles.find((item) => item.id === profileId);
  if (!profile) {
    const available = loaded.profiles.map((item) => item.id).join(", ") || "none";
    return { error: `unsupported profile '${profileId}' (available: ${available})` };
  }

  if (profile.modules.length === 0) {
    return { error: `profile '${profileId}' has no modules` };
  }

  return { profile };
}

function loadTargetManifest(root) {
  const path = join(root, ".harness", "manifest.yaml");
  if (!existsSync(path)) {
    return { error: ".harness/manifest.yaml: missing" };
  }

  try {
    const manifest = readYamlFile(path);
    if (!manifest?.harness) {
      return { error: ".harness/manifest.yaml: missing top-level harness key" };
    }

    return { manifest, harness: manifest.harness, path };
  } catch (parseError) {
    return { error: `.harness/manifest.yaml: YAML parse error: ${parseError.message}` };
  }
}

function installedIds(harness) {
  return new Set((harness?.modules ?? []).map((module) => module.id).filter(Boolean));
}

function preflightState(errors = []) {
  if (errors.some((error) => /already exists|command '.*' already exists/.test(error))) {
    return "review-required";
  }
  return "blocked";
}

function sourceModuleSummary(moduleId, sourceRoot) {
  const loaded = loadSourceModule(moduleId, sourceRoot);
  if (loaded.error) {
    return {
      ok: false,
      id: moduleId,
      source_status: "unavailable",
      errors: [loaded.error],
    };
  }

  const module = loaded.module;
  return {
    ok: true,
    id: module.id,
    source_status: loaded.entry.status ?? "unknown",
    source_path: loaded.entry.path,
    version: module.version ?? "unknown",
    installable: loaded.entry.installable !== false,
    process_domains: module.process_domains ?? [],
    provides: module.provides ?? [],
    managed_files: (module.managed_files ?? []).map((file) => ({
      path: file.path,
      mode: file.mode ?? "merge",
    })),
    commands: Object.entries(module.commands ?? {}).map(([name, command]) => ({ name, command })),
    artifacts: [
      {
        path: `modules/${module.id}/module.yaml`,
        type: "template",
        source: `modules/${module.id}/module.yaml`,
      },
      ...(module.install?.artifacts ?? []).map((artifact) => ({
        path: artifact.path,
        type: artifact.type,
        ...(artifact.source ? { source: artifact.source } : {}),
      })),
    ],
    errors: [],
  };
}

function inspectModule({ moduleId, sourceRoot, target }) {
  const source = sourceModuleSummary(moduleId, sourceRoot);
  const state = {
    ...source,
    target_status: target.inspected ? "missing" : "not-inspected",
    install_preflight: target.inspected ? "not-run" : "not-inspected",
    installed: false,
    errors: [...(source.errors ?? [])],
  };

  if (!target.inspected) return state;

  if (target.installedIds.has(moduleId)) {
    return {
      ...state,
      target_status: "installed",
      install_preflight: "not-needed",
      installed: true,
      errors: [],
    };
  }

  if (!source.ok) {
    return {
      ...state,
      target_status: "blocked",
      install_preflight: "blocked",
    };
  }

  if (!source.installable) {
    return {
      ...state,
      target_status: "blocked",
      install_preflight: "blocked",
      errors: [`module '${moduleId}' is not installable`],
    };
  }

  const preflight = planModuleInstall({
    root: target.root,
    moduleId,
    force: false,
    sourceRoot,
  });
  if (preflight.ok) {
    return {
      ...state,
      target_status: "clean-install",
      install_preflight: "clean",
      planned_artifacts: preflight.artifacts,
    };
  }

  const status = preflightState(preflight.errors);
  return {
    ...state,
    target_status: status,
    install_preflight: status,
    errors: preflight.errors ?? [],
  };
}

function summarizeInspection(modules) {
  const summary = {
    total: modules.length,
    installed: 0,
    clean_install: 0,
    review_required: 0,
    blocked: 0,
    not_inspected: 0,
  };

  for (const module of modules) {
    if (module.target_status === "installed") summary.installed += 1;
    if (module.target_status === "clean-install") summary.clean_install += 1;
    if (module.target_status === "review-required") summary.review_required += 1;
    if (module.target_status === "blocked") summary.blocked += 1;
    if (module.target_status === "not-inspected") summary.not_inspected += 1;
  }

  return summary;
}

function printHelp() {
  console.log(`harness profiles

Usage:
  harness profiles list
  harness profiles inspect <profile> [--target <path>] [--json]
`);
}

function runList({ sourceRoot }) {
  const loaded = loadProfiles(sourceRoot);
  if (loaded.errors.length > 0) {
    for (const error of loaded.errors) {
      console.error(`fail ${error}`);
    }
    return { ok: false, errors: loaded.errors };
  }

  for (const profile of loaded.profiles) {
    console.log(`${profile.id} ${profile.status} modules=${profile.modules.join(",")}`);
  }

  return { ok: true, profiles: loaded.profiles };
}

function printInspect(result) {
  console.log("Harness profile inspect");
  console.log(`profile: ${result.profile.id}`);
  console.log(`status: ${result.profile.status}`);
  console.log(`path: ${result.profile.path}`);
  console.log(`target: ${result.target.inspected ? result.target.root : "not inspected"}`);
  if (result.target.inspected) {
    console.log(`target_profile: ${result.target.profile}`);
  } else if (result.target.detail) {
    console.log(`target_detail: ${result.target.detail}`);
  }
  console.log("summary:");
  console.log(`  modules: ${result.summary.total}`);
  console.log(`  installed: ${result.summary.installed}`);
  console.log(`  clean_install: ${result.summary.clean_install}`);
  console.log(`  review_required: ${result.summary.review_required}`);
  console.log(`  blocked: ${result.summary.blocked}`);
  console.log(`  not_inspected: ${result.summary.not_inspected}`);
  console.log("modules:");
  for (const module of result.modules) {
    console.log(`  ${module.id}: ${module.target_status}`);
    console.log(`    version: ${module.version ?? "unknown"}`);
    console.log(`    source_status: ${module.source_status}`);
    console.log(`    installable: ${module.installable ? "yes" : "no"}`);
    console.log(`    managed_files: ${module.managed_files?.length ?? 0}`);
    console.log(`    commands: ${module.commands?.length ?? 0}`);
    console.log(`    artifacts: ${module.artifacts?.length ?? 0}`);
    if (module.errors.length > 0) {
      console.log(`    errors: ${module.errors.join("; ")}`);
    }
  }
}

function runInspect({ cwd, args, sourceRoot }) {
  const [profileId] = positionalArgs(args);
  const wantsJson = args.includes("--json");
  const targetExplicit = args.includes("--target");
  const targetMissing = missingFlagValue(args, "--target");
  const targetRoot = resolve(cwd, argValue(args, "--target", cwd));

  if (!profileId) {
    const errors = ["profiles inspect requires a profile id"];
    if (wantsJson) console.log(JSON.stringify({ ok: false, errors }, null, 2));
    else console.error(`fail ${errors[0]}`);
    return { ok: false, errors };
  }

  if (targetMissing) {
    const errors = ["profiles inspect --target requires a path"];
    if (wantsJson) console.log(JSON.stringify({ ok: false, errors }, null, 2));
    else console.error(`fail ${errors[0]}`);
    return { ok: false, errors };
  }

  const loaded = loadProfile(profileId, sourceRoot);
  if (loaded.error) {
    const errors = [loaded.error];
    if (wantsJson) console.log(JSON.stringify({ ok: false, errors }, null, 2));
    else console.error(`fail ${loaded.error}`);
    return { ok: false, errors };
  }

  const loadedTarget = loadTargetManifest(targetRoot);
  if (targetExplicit && loadedTarget.error) {
    const errors = [loadedTarget.error];
    if (wantsJson) console.log(JSON.stringify({ ok: false, errors }, null, 2));
    else console.error(`fail ${loadedTarget.error}`);
    return { ok: false, errors };
  }

  const target = loadedTarget.error
    ? {
      inspected: false,
      root: targetRoot,
      profile: null,
      installedIds: new Set(),
      detail: loadedTarget.error,
    }
    : {
      inspected: true,
      root: targetRoot,
      profile: loadedTarget.harness.profile ?? "unknown",
      installedIds: installedIds(loadedTarget.harness),
      detail: "manifest loaded",
    };

  const modules = loaded.profile.modules.map((moduleId) =>
    inspectModule({ moduleId, sourceRoot, target }));
  const result = {
    ok: true,
    profile: loaded.profile,
    target: {
      inspected: target.inspected,
      root: target.root,
      profile: target.profile,
      detail: target.detail,
    },
    summary: summarizeInspection(modules),
    modules,
  };

  if (wantsJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printInspect(result);
  }
  return result;
}

export function runProfiles({ cwd = process.cwd(), args = [], sourceRoot = SOURCE_ROOT } = {}) {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return { ok: true };
  }

  if (subcommand === "list") {
    return runList({ sourceRoot });
  }

  if (subcommand === "inspect") {
    return runInspect({ cwd, args: rest, sourceRoot });
  }

  console.error(`fail unknown profiles command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runProfiles({ args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
