import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { updateLockFromPaths } from "./lock.mjs";
import { installModule, loadSourceModule, planModuleInstall } from "./modules.mjs";

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

function emitResult({ result, wantsJson, print }) {
  if (wantsJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (print) {
    print(result);
  }
  return result;
}

function emitFailure({ errors, wantsJson }) {
  if (wantsJson) {
    console.log(JSON.stringify({ ok: false, errors }, null, 2));
  } else {
    for (const error of errors) {
      console.error(`fail ${error}`);
    }
  }
  return { ok: false, errors };
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

function addOperation(operations, { code, subject_type: subjectType, subject, detail, ...extra }) {
  const [status] = code.split("/");
  operations.push({
    code,
    status,
    subject_type: subjectType,
    subject,
    detail,
    ...extra,
  });
}

function summarizeOperations(operations) {
  const byStatus = {};
  const byCode = {};
  for (const operation of operations) {
    byStatus[operation.status] = (byStatus[operation.status] ?? 0) + 1;
    byCode[operation.code] = (byCode[operation.code] ?? 0) + 1;
  }

  return {
    total: operations.length,
    by_status: Object.fromEntries(Object.entries(byStatus).sort(([a], [b]) => a.localeCompare(b))),
    by_code: Object.fromEntries(Object.entries(byCode).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function installedModuleIds(harness) {
  return (harness?.modules ?? []).map((module) => module.id).filter(Boolean);
}

function buildSwitchPlan({ requestedProfile, target, modules }) {
  const actions = [];
  const warnings = [];
  const blockers = [];
  const notes = [
    "apply installs clean profile modules then updates the manifest profile",
    "apply refuses plans that contain review-required or blocked operations",
    "modules outside the requested profile are retained by default",
  ];
  const operations = [];
  const requestedIds = new Set(requestedProfile.modules);
  const currentProfile = target.harness.profile ?? "unknown";
  const retainedModules = installedModuleIds(target.harness)
    .filter((moduleId) => !requestedIds.has(moduleId))
    .sort();

  for (const module of modules) {
    if (module.target_status === "installed") {
      addOperation(operations, {
        code: "safe/profile-module-present",
        subject_type: "module",
        subject: module.id,
        detail: "module is already installed in the target repo",
      });
      continue;
    }

    if (module.target_status === "clean-install") {
      actions.push(`install profile module ${module.id}`);
      addOperation(operations, {
        code: "safe/profile-module-install",
        subject_type: "module",
        subject: module.id,
        detail: "module is required by the requested profile and install preflight found no collisions",
        install: {
          module_id: module.id,
          artifacts: module.planned_artifacts ?? [],
        },
      });
      continue;
    }

    if (module.target_status === "review-required") {
      const detail = (module.errors ?? []).join("; ") || "module install needs review";
      warnings.push(`profile module '${module.id}' needs review before switch: ${detail}`);
      addOperation(operations, {
        code: "review/profile-module-install-collision",
        subject_type: "module",
        subject: module.id,
        detail,
      });
      continue;
    }

    if (module.target_status === "blocked") {
      const detail = (module.errors ?? []).join("; ") || "module install is blocked";
      blockers.push(`profile module '${module.id}' cannot be installed: ${detail}`);
      addOperation(operations, {
        code: "blocked/profile-module-install-unavailable",
        subject_type: "module",
        subject: module.id,
        detail,
      });
      continue;
    }

    blockers.push(`profile module '${module.id}' has unsupported switch state '${module.target_status}'`);
    addOperation(operations, {
      code: "blocked/profile-module-state-unsupported",
      subject_type: "module",
      subject: module.id,
      detail: `unsupported switch state '${module.target_status}'`,
    });
  }

  for (const moduleId of retainedModules) {
    addOperation(operations, {
      code: "deferred/profile-module-retained",
      subject_type: "module",
      subject: moduleId,
      detail: "installed module is outside the requested profile and will be retained by default",
    });
  }

  if (currentProfile === requestedProfile.id) {
    addOperation(operations, {
      code: "safe/profile-noop",
      subject_type: "profile",
      subject: requestedProfile.id,
      detail: "target already records the requested profile",
    });
  } else if (blockers.length > 0) {
    addOperation(operations, {
      code: "blocked/profile-update",
      subject_type: "profile",
      subject: `${currentProfile} -> ${requestedProfile.id}`,
      detail: "profile update is blocked until required modules are installable",
    });
  } else if (warnings.length > 0) {
    addOperation(operations, {
      code: "review/profile-update",
      subject_type: "profile",
      subject: `${currentProfile} -> ${requestedProfile.id}`,
      detail: "profile update waits for review-required module operations",
    });
  } else {
    actions.push(`update target profile ${currentProfile} -> ${requestedProfile.id}`);
    addOperation(operations, {
      code: "safe/profile-update",
      subject_type: "profile",
      subject: `${currentProfile} -> ${requestedProfile.id}`,
      detail: "after required modules are installed, update the target manifest profile",
      update: {
        path: ".harness/manifest.yaml",
        from: currentProfile,
        to: requestedProfile.id,
      },
    });
  }

  return {
    actions,
    warnings,
    blockers,
    notes,
    retained_modules: retainedModules,
    operations,
    operation_summary: summarizeOperations(operations),
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function applySwitchPlan({ root, plan, sourceRoot }) {
  const blockers = plan.operations.filter((operation) => operation.status === "blocked");
  const reviews = plan.operations.filter((operation) => operation.status === "review");
  const skipped = plan.operations.filter((operation) => operation.status === "deferred");

  if (blockers.length > 0 || reviews.length > 0) {
    return {
      ok: false,
      target: root,
      applied: [],
      skipped,
      blockers,
      reviews,
      errors: [
        ...reviews.map((operation) => `${operation.code}: ${operation.subject}`),
        ...blockers.map((operation) => `${operation.code}: ${operation.subject}`),
      ],
    };
  }

  const applied = [];
  const moduleInstalls = plan.operations.filter(
    (operation) => operation.code === "safe/profile-module-install",
  );

  for (const operation of moduleInstalls) {
    const moduleId = operation.install?.module_id ?? operation.subject;
    const preflight = planModuleInstall({ root, moduleId, force: false, sourceRoot });
    if (!preflight.ok) {
      return {
        ok: false,
        target: root,
        applied,
        skipped,
        blockers,
        reviews,
        errors: (preflight.errors ?? []).map((error) => `${operation.code}: ${moduleId}: ${error}`),
      };
    }
  }

  for (const operation of moduleInstalls) {
    const moduleId = operation.install?.module_id ?? operation.subject;
    const installed = installModule({ root, moduleId, force: false, sourceRoot });
    if (!installed.ok) {
      return {
        ok: false,
        target: root,
        applied,
        skipped,
        blockers,
        reviews,
        errors: (installed.errors ?? []).map((error) => `${operation.code}: ${moduleId}: ${error}`),
      };
    }
    applied.push(installed.noop
      ? `safe/profile-module-install: ${moduleId} already installed`
      : `safe/profile-module-install: ${moduleId}`);
  }

  const presentCount = plan.operations.filter(
    (operation) => operation.code === "safe/profile-module-present",
  ).length;
  if (presentCount > 0) {
    applied.push(`safe/profile-module-present: ${presentCount} module(s) already installed`);
  }

  const profileUpdate = plan.operations.find((operation) => operation.code === "safe/profile-update");
  if (profileUpdate) {
    const manifestPath = join(root, ".harness", "manifest.yaml");
    let manifest;
    try {
      manifest = parseYaml(readFileSync(manifestPath, "utf8"));
    } catch (parseError) {
      return {
        ok: false,
        target: root,
        applied,
        skipped,
        blockers,
        reviews,
        errors: [`safe/profile-update: .harness/manifest.yaml: YAML parse error: ${parseError.message}`],
      };
    }
    if (!manifest?.harness) {
      return {
        ok: false,
        target: root,
        applied,
        skipped,
        blockers,
        reviews,
        errors: ["safe/profile-update: manifest missing top-level harness key"],
      };
    }

    const toProfile = profileUpdate.update?.to;
    if (!toProfile) {
      return {
        ok: false,
        target: root,
        applied,
        skipped,
        blockers,
        reviews,
        errors: [`safe/profile-update: ${profileUpdate.subject}: missing update target`],
      };
    }

    manifest.harness.profile = toProfile;
    writeFileSync(manifestPath, stringifyYaml(manifest));
    updateLockFromPaths({
      root,
      harness: manifest.harness,
      paths: [".harness/manifest.yaml"],
      generatedAt: todayIso(),
    });
    applied.push(`safe/profile-update: ${profileUpdate.subject}`);
  }

  const noopCount = plan.operations.filter((operation) => operation.code === "safe/profile-noop").length;
  if (noopCount > 0) {
    applied.push("safe/profile-noop: target already on requested profile");
  }

  return {
    ok: true,
    target: root,
    applied,
    skipped,
    blockers,
    reviews,
    errors: [],
  };
}

function printSwitchApply(result) {
  console.log("Harness profile switch apply");
  console.log(`target: ${result.target.root}`);
  console.log(`current_profile: ${result.target.current_profile}`);
  console.log(`requested_profile: ${result.requested_profile.id}`);
  console.log(`apply_ok: ${result.apply.ok ? "yes" : "no"}`);
  printList("applied", result.apply.applied);
  printList(
    "skipped",
    result.apply.skipped.map((operation) => `${operation.code}: ${operation.subject}`),
  );
  printList(
    "reviews",
    result.apply.reviews.map((operation) => `${operation.code}: ${operation.subject}`),
  );
  printList(
    "blockers",
    result.apply.blockers.map((operation) => `${operation.code}: ${operation.subject}`),
  );
  printList("errors", result.apply.errors);
}

function printHelp() {
  console.log(`harness profiles

Usage:
  harness profiles list
  harness profiles inspect <profile> [--target <path>] [--json]
  harness profiles switch <profile> --plan [--target <path>] [--json]
  harness profiles switch <profile> --apply [--target <path>] [--json]
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

function printList(label, items) {
  console.log(`${label}:`);
  if (items.length === 0) {
    console.log("  none");
    return;
  }
  for (const item of items) {
    console.log(`  ${item}`);
  }
}

function printSwitchPlan(result) {
  console.log("Harness profile switch plan");
  console.log(`target: ${result.target.root}`);
  console.log(`current_profile: ${result.target.current_profile}`);
  console.log(`requested_profile: ${result.requested_profile.id}`);
  console.log(`mode: ${result.mode}`);
  console.log(`apply_available: ${result.apply_available ? "yes" : "no"}`);
  console.log("summary:");
  console.log(`  modules: ${result.summary.total}`);
  console.log(`  installed: ${result.summary.installed}`);
  console.log(`  clean_install: ${result.summary.clean_install}`);
  console.log(`  review_required: ${result.summary.review_required}`);
  console.log(`  blocked: ${result.summary.blocked}`);
  console.log(`  retained: ${result.summary.retained}`);
  console.log("modules:");
  for (const module of result.modules) {
    console.log(`  ${module.id}: ${module.target_status}`);
    if (module.errors.length > 0) {
      console.log(`    errors: ${module.errors.join("; ")}`);
    }
  }
  console.log("operations:");
  console.log(`  total: ${result.operation_summary.total}`);
  for (const [status, count] of Object.entries(result.operation_summary.by_status)) {
    console.log(`  ${status}: ${count}`);
  }
  for (const operation of result.operations) {
    console.log(`  ${operation.code}: ${operation.subject_type} ${operation.subject}`);
    console.log(`    ${operation.detail}`);
  }
  printList("actions", result.actions);
  printList("warnings", result.warnings);
  printList("blockers", result.blockers);
  printList("notes", result.notes);
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

function runSwitch({ cwd, args, sourceRoot }) {
  const [profileId] = positionalArgs(args);
  const wantsJson = args.includes("--json");
  const wantsPlan = args.includes("--plan");
  const wantsApply = args.includes("--apply");
  const targetMissing = missingFlagValue(args, "--target");
  const targetRoot = resolve(cwd, argValue(args, "--target", cwd));

  if (!profileId) {
    return emitFailure({ errors: ["profiles switch requires a profile id"], wantsJson });
  }

  if (targetMissing) {
    return emitFailure({ errors: ["profiles switch --target requires a path"], wantsJson });
  }

  if (!wantsPlan && !wantsApply) {
    return emitFailure({ errors: ["profiles switch requires --plan or --apply"], wantsJson });
  }

  if (wantsPlan && wantsApply) {
    return emitFailure({ errors: ["profiles switch cannot use --plan and --apply together"], wantsJson });
  }

  const loaded = loadProfile(profileId, sourceRoot);
  if (loaded.error) {
    return emitFailure({ errors: [loaded.error], wantsJson });
  }

  const loadedTarget = loadTargetManifest(targetRoot);
  if (loadedTarget.error) {
    return emitFailure({ errors: [loadedTarget.error], wantsJson });
  }

  const target = {
    inspected: true,
    root: targetRoot,
    profile: loadedTarget.harness.profile ?? "unknown",
    installedIds: installedIds(loadedTarget.harness),
    harness: loadedTarget.harness,
    detail: "manifest loaded",
  };

  const modules = loaded.profile.modules.map((moduleId) =>
    inspectModule({ moduleId, sourceRoot, target }));
  const switchPlan = buildSwitchPlan({
    requestedProfile: loaded.profile,
    target,
    modules,
  });
  const inspectionSummary = summarizeInspection(modules);
  const planResult = {
    ok: true,
    mode: wantsApply ? "apply" : "plan",
    plan_schema_version: 1,
    apply_available: true,
    target: {
      root: target.root,
      current_profile: target.profile,
      manifest: ".harness/manifest.yaml",
    },
    requested_profile: loaded.profile,
    summary: {
      ...inspectionSummary,
      retained: switchPlan.retained_modules.length,
      ready: switchPlan.blockers.length === 0 && switchPlan.warnings.length === 0,
    },
    modules,
    retained_modules: switchPlan.retained_modules,
    operation_summary: switchPlan.operation_summary,
    operations: switchPlan.operations,
    actions: switchPlan.actions,
    warnings: switchPlan.warnings,
    blockers: switchPlan.blockers,
    notes: switchPlan.notes,
  };

  if (wantsPlan) {
    return emitResult({ result: planResult, wantsJson, print: printSwitchPlan });
  }

  const apply = applySwitchPlan({ root: targetRoot, plan: planResult, sourceRoot });
  const applyResult = {
    ...planResult,
    ok: apply.ok,
    apply,
  };
  return emitResult({ result: applyResult, wantsJson, print: printSwitchApply });
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

  if (subcommand === "switch") {
    return runSwitch({ cwd, args: rest, sourceRoot });
  }

  console.error(`fail unknown profiles command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runProfiles({ args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
