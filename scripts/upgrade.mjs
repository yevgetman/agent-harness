import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createLockFromManifest, hashFile, lockFileMap, readLock, writeLock } from "./lock.mjs";
import { installModule, planModuleInstall } from "./modules.mjs";
import { loadProfile } from "./profiles.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(SCRIPT_DIR, "..");
const PLAN_SCHEMA_VERSION = 1;
const OPERATION_CONTRACT_VERSION = 2;
const SAFE_APPLY_CODES = new Set([
  "safe/noop",
  "safe/refresh-lock",
  "safe/repair-command",
  "safe/install-module",
]);

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readPackageVersion() {
  return readJsonFile(join(SOURCE_ROOT, "package.json")).version;
}

function readSourcePackageScripts() {
  return readJsonFile(join(SOURCE_ROOT, "package.json")).scripts ?? {};
}

function versionSourceFor(harness) {
  const sourceType = harness.source?.type;
  if (sourceType === "package") {
    return {
      type: "package",
      package: harness.source.package ?? readJsonFile(join(SOURCE_ROOT, "package.json")).name,
      channel: harness.source.channel ?? "unknown",
      registry_tag: harness.source.registry_tag ?? "latest",
      install_model: harness.source.install_model ?? harness.upgrade?.model ?? "installed-instance",
      harness_package: "package.json",
      module_registry: "modules/registry.yaml",
      modules: "modules/<id>/module.yaml",
    };
  }

  if (sourceType === "local") {
    return {
      type: "local-checkout",
      path: harness.source.path ?? SOURCE_ROOT,
      channel: harness.source.channel ?? "unknown",
      install_model: harness.source.install_model ?? harness.upgrade?.model ?? "installed-instance",
      harness_package: "package.json",
      module_registry: "modules/registry.yaml",
      modules: "modules/<id>/module.yaml",
    };
  }

  return {
    type: sourceType ?? "unknown",
    channel: harness.source?.channel ?? "unknown",
    install_model: harness.source?.install_model ?? harness.upgrade?.model ?? "installed-instance",
    harness_package: "package.json",
    module_registry: "modules/registry.yaml",
    modules: "modules/<id>/module.yaml",
  };
}

function sourceSummary(versionSource) {
  if (versionSource.type === "package") {
    return `${versionSource.package}@${versionSource.registry_tag ?? "latest"} (${versionSource.channel ?? "unknown"})`;
  }
  if (versionSource.type === "local-checkout") {
    return `${versionSource.path ?? "unknown"} (${versionSource.channel ?? "unknown"})`;
  }
  return `${versionSource.type ?? "unknown"} (${versionSource.channel ?? "unknown"})`;
}

function nextOperatorAction({
  versionSource,
  registryVersion,
  installedVersion,
  availableVersion,
  blockers,
  warnings,
}) {
  if (blockers.length > 0) {
    return "Resolve blockers in this repo before applying any harness upgrade operation.";
  }

  if (installedVersion !== availableVersion) {
    return `Review the harness version change ${installedVersion} -> ${availableVersion}; rerun the plan after updating this repo's installed harness package or manifest state.`;
  }

  if (warnings.length > 0) {
    return "Review warning-level operations in this repo before running harness upgrade apply.";
  }

  if (versionSource.type === "package" && registryVersion?.status === "available") {
    return `This repo is already planned against ${versionSource.package}@${registryVersion.version}; run harness upgrade apply for supported safe operations.`;
  }

  if (versionSource.type === "package") {
    return `When a newer harness package is available, install or update ${versionSource.package} in this repo, then rerun harness upgrade --plan here.`;
  }

  if (versionSource.type === "local-checkout") {
    return "Update the local harness checkout, then rerun harness upgrade --plan inside each repo that should receive the new behavior.";
  }

  return "Confirm the harness source configuration, then rerun harness upgrade --plan inside this repo.";
}

function upgradeGuidanceFor({
  harness,
  versionSource,
  registryVersion,
  installedVersion,
  availableVersion,
  blockers,
  warnings,
}) {
  return {
    model: versionSource.install_model ?? "installed-instance",
    tracking: "repo-local",
    source_boundary: "the harness source repo does not track installed target repos",
    current_instance: {
      profile: harness.profile ?? "unknown",
      source_type: versionSource.type,
      channel: versionSource.channel ?? "unknown",
      package: versionSource.package ?? null,
      registry_tag: versionSource.registry_tag ?? null,
      local_path: versionSource.path ?? null,
      source: sourceSummary(versionSource),
    },
    next_operator_action: nextOperatorAction({
      versionSource,
      registryVersion,
      installedVersion,
      availableVersion,
      blockers,
      warnings,
    }),
    operator_workflow: [
      "Update, build, or install the desired harness tool version outside the target repo when needed.",
      "Run harness upgrade --plan inside the target repo with that harness tool.",
      "Resolve blockers and review-required operations before running harness upgrade apply for supported safe operations.",
    ],
  };
}

function npmRegistryResult({
  packageName,
  distTag,
  status,
  version = null,
  detail,
}) {
  return {
    type: "npm",
    package: packageName,
    dist_tag: distTag,
    registry: "https://registry.npmjs.org/",
    status,
    version,
    detail,
  };
}

function discoverNpmRegistryVersion({ packageName, distTag = "latest" } = {}) {
  if (!packageName) {
    return npmRegistryResult({
      packageName: "unknown",
      distTag,
      status: "unavailable",
      detail: "package name is unavailable",
    });
  }

  if (process.env.HARNESS_REGISTRY_DISCOVERY === "skip") {
    return npmRegistryResult({
      packageName,
      distTag,
      status: "skipped",
      detail: "registry discovery skipped by HARNESS_REGISTRY_DISCOVERY",
    });
  }

  const result = spawnSync("npm", ["view", `${packageName}@${distTag}`, "version", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
  });

  if (result.error) {
    return npmRegistryResult({
      packageName,
      distTag,
      status: "unavailable",
      detail: `npm registry lookup failed: ${result.error.message}`,
    });
  }

  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const notFoundOrPrivate = /E404|404 Not Found|could not be found|not found|permission/i.test(output);
    return npmRegistryResult({
      packageName,
      distTag,
      status: notFoundOrPrivate ? "unpublished-or-private" : "unavailable",
      detail: notFoundOrPrivate
        ? "npm registry returned not found or permission denied"
        : `npm registry lookup exited ${result.status}`,
    });
  }

  const raw = String(result.stdout ?? "").trim();
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string" || typeof parsed === "number") {
      return npmRegistryResult({
        packageName,
        distTag,
        status: "available",
        version: String(parsed),
        detail: "npm registry version discovered",
      });
    }
  } catch (parseError) {
    return npmRegistryResult({
      packageName,
      distTag,
      status: "unavailable",
      detail: `npm registry output was not parseable JSON: ${parseError.message}`,
    });
  }

  return npmRegistryResult({
    packageName,
    distTag,
    status: "unavailable",
    detail: "npm registry output did not contain a version string",
  });
}

function registryDiscoveryFor(versionSource, registryDiscovery) {
  if (versionSource.type !== "package") return null;
  return registryDiscovery({
    packageName: versionSource.package,
    distTag: versionSource.registry_tag ?? "latest",
  });
}

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function printHelp() {
  console.log(`harness upgrade

Usage:
  harness upgrade --plan
  harness upgrade --plan --json
  harness upgrade plan
  harness upgrade apply

The apply command is currently limited to safe/noop, safe/refresh-lock,
deterministic safe/repair-command package-script repairs, and clean
safe/install-module profile-module installs. It refuses blocked and
review-required plans.
`);
}

function loadManifest(root) {
  const path = join(root, ".harness", "manifest.yaml");
  if (!existsSync(path)) {
    return { error: ".harness/manifest.yaml: missing" };
  }

  try {
    const manifest = readYamlFile(path);
    if (!manifest?.harness) {
      return { error: ".harness/manifest.yaml: missing top-level harness key" };
    }
    return { harness: manifest.harness };
  } catch (parseError) {
    return { error: `.harness/manifest.yaml: YAML parse error: ${parseError.message}` };
  }
}

function loadModuleDefinition(root, moduleId) {
  const path = join(root, "modules", moduleId, "module.yaml");
  if (!existsSync(path)) {
    return { path, module: null, error: "missing" };
  }

  try {
    const moduleYaml = readYamlFile(path);
    return { path, module: moduleYaml?.module ?? null, error: moduleYaml?.module ? null : "missing-module-key" };
  } catch (parseError) {
    return { path, module: null, error: `parse-error: ${parseError.message}` };
  }
}

function loadSourceRegistry() {
  const path = join(SOURCE_ROOT, "modules", "registry.yaml");
  if (!existsSync(path)) {
    return { path, modules: [], error: "missing" };
  }

  try {
    const registry = readYamlFile(path);
    if (!Array.isArray(registry?.modules)) {
      return { path, modules: [], error: "missing-modules-list" };
    }
    return { path, modules: registry.modules, error: null };
  } catch (parseError) {
    return { path, modules: [], error: `parse-error: ${parseError.message}` };
  }
}

function loadSourceModuleDefinition(registryEntry) {
  if (!registryEntry?.path) {
    return { path: null, module: null, error: "missing-registry-path" };
  }

  const path = join(SOURCE_ROOT, registryEntry.path);
  if (!existsSync(path)) {
    return { path, module: null, error: "missing" };
  }

  try {
    const moduleYaml = readYamlFile(path);
    return { path, module: moduleYaml?.module ?? null, error: moduleYaml?.module ? null : "missing-module-key" };
  } catch (parseError) {
    return { path, module: null, error: `parse-error: ${parseError.message}` };
  }
}

function loadPackageScripts(root) {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;

  try {
    return readJsonFile(path).scripts ?? {};
  } catch {
    return null;
  }
}

function packageScriptPrereqsExist(root, scriptCommand) {
  const nodeFile = scriptCommand.match(/^node ([^\s]+)(?:\s|$)/);
  if (!nodeFile) return true;
  return existsSync(join(root, nodeFile[1]));
}

function repairablePackageScript(root, script, scripts) {
  if (!scripts || scripts[script]) return null;

  const expected = readSourcePackageScripts()[script];
  if (!expected || !packageScriptPrereqsExist(root, expected)) return null;

  return {
    kind: "package-script",
    script,
    value: expected,
  };
}

function commandStatus(root, command, scripts) {
  if (typeof command !== "string" || command.trim() === "") {
    return { status: "blocker", detail: "command must be a non-empty string" };
  }

  if (command === "npm test") {
    if (!scripts) return { status: "blocker", detail: "package.json is missing or invalid" };
    if (scripts.test) return { status: "present", detail: "package script test exists" };
    const repair = repairablePackageScript(root, "test", scripts);
    return repair
      ? { status: "repairable", detail: "package script test is missing but can be restored", repair }
      : { status: "blocker", detail: "package script test is missing" };
  }

  const npmRun = command.match(/^npm run ([^\s]+)$/);
  if (npmRun) {
    if (!scripts) return { status: "blocker", detail: "package.json is missing or invalid" };
    const script = npmRun[1];
    if (scripts[script]) return { status: "present", detail: `package script ${script} exists` };
    const repair = repairablePackageScript(root, script, scripts);
    return repair
      ? { status: "repairable", detail: `package script ${script} is missing but can be restored`, repair }
      : { status: "blocker", detail: `package script ${script} is missing` };
  }

  const nodeFile = command.match(/^node ([^\s]+)(?:\s|$)/);
  if (nodeFile) {
    return existsSync(join(root, nodeFile[1]))
      ? { status: "present", detail: `${nodeFile[1]} exists` }
      : { status: "blocker", detail: `${nodeFile[1]} is missing` };
  }

  if (command.startsWith("harness ")) {
    return { status: "external", detail: "external harness CLI command" };
  }

  return { status: "unknown", detail: "command shape is not mechanically checked" };
}

function managedFileState(root, file, lockByPath, lockStatus) {
  const path = join(root, file.path);
  const lockEntry = lockByPath.get(file.path);
  if (!existsSync(path)) {
    return {
      path: file.path,
      owner: file.owner ?? "unknown",
      mode: file.mode ?? "unknown",
      status: "missing",
      detail: lockEntry
        ? "managed file is missing but has a lock fingerprint"
        : "managed file is missing",
    };
  }

  const text = readFileSync(path, "utf8");
  const hasHarnessMarker = [
    "Harness metadata:",
    "Harness managed file:",
    "Installed harness package:",
    "\nharness:\n",
  ].some((marker) => text.includes(marker));
  if (lockEntry?.sha256) {
    const actual = hashFile(root, file.path);
    const markerDetail = hasHarnessMarker
      ? "contains harness management marker"
      : "no harness management marker";
    const matches = actual === lockEntry.sha256;
    return {
      path: file.path,
      owner: file.owner ?? "unknown",
      mode: file.mode ?? "unknown",
      status: matches ? "present-clean" : "present-modified",
      detail: matches
        ? `matches lock fingerprint; ${markerDetail}`
        : `differs from lock fingerprint; ${markerDetail}`,
    };
  }

  const status = lockStatus === "present"
    ? "present-unlocked"
    : hasHarnessMarker ? "present-managed" : "present-unmarked";
  const detail = status === "present-unlocked"
    ? "present but no lock fingerprint"
    : status === "present-managed"
      ? "contains harness management marker"
      : "present but no harness management marker";

  return {
    path: file.path,
    owner: file.owner ?? "unknown",
    mode: file.mode ?? "unknown",
    status,
    detail,
  };
}

function uniqueInstalledModuleIds(modules) {
  return new Set((modules ?? []).map((moduleRef) => moduleRef.id).filter(Boolean));
}

function collectAvailableRegistryModules() {
  const registry = loadSourceRegistry();
  if (registry.error) return [];

  const byId = new Map();
  for (const entry of registry.modules) {
    if (!entry?.id || entry.installable === false || byId.has(entry.id)) continue;
    byId.set(entry.id, entry);
  }
  return Array.from(byId.values());
}

function activeProfileModuleIds(profileId) {
  const loaded = loadProfile(profileId, SOURCE_ROOT);
  if (loaded.error) {
    return { ids: new Set(), error: loaded.error };
  }

  return { ids: new Set(loaded.profile.modules), error: null };
}

function installPreflightStatus(error) {
  if (/already exists|command '.*' already exists/.test(error)) {
    return "review";
  }
  return "blocked";
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

function buildPlan({ root, registryDiscovery = discoverNpmRegistryVersion }) {
  const loaded = loadManifest(root);
  if (loaded.error) {
    return { ok: false, error: loaded.error };
  }

  const harness = loaded.harness;
  const localPackageVersion = readPackageVersion();
  const installedVersion = String(harness.harness_version ?? "unknown");
  const actions = [];
  const blockers = [];
  const warnings = [];
  const notes = [];
  const modules = [];
  const commands = [];
  const managedFiles = [];
  const operations = [];
  const scripts = loadPackageScripts(root);
  const installedIds = uniqueInstalledModuleIds(harness.modules);
  const availableRegistryModules = collectAvailableRegistryModules();
  const activeProfile = activeProfileModuleIds(harness.profile);
  const loadedLock = readLock(root);
  const lockByPath = loadedLock.lock ? lockFileMap(loadedLock.lock) : new Map();
  const versionSource = versionSourceFor(harness);
  const registryVersion = registryDiscoveryFor(versionSource, registryDiscovery);
  if (registryVersion) {
    versionSource.registry = registryVersion;
  }
  const availableVersion = registryVersion?.status === "available" && registryVersion.version
    ? registryVersion.version
    : localPackageVersion;
  const lock = {
    status: loadedLock.status,
    files: loadedLock.lock?.files?.length ?? 0,
    detail: loadedLock.error ?? "lock file is present",
  };

  if (loadedLock.status === "missing") {
    warnings.push(".harness/lock.yaml is missing; provenance is unavailable");
    addOperation(operations, {
      code: "review/missing-lock",
      subject_type: "lock",
      subject: ".harness/lock.yaml",
      detail: "lock provenance is unavailable; review current files before accepting them as baseline",
    });
    addOperation(operations, {
      code: "safe/refresh-lock",
      subject_type: "lock",
      subject: ".harness/lock.yaml",
      detail: "after review, harness lock refresh can record current installed-file fingerprints",
    });
  } else if (loadedLock.status === "invalid") {
    blockers.push(loadedLock.error);
    addOperation(operations, {
      code: "blocked/invalid-lock",
      subject_type: "lock",
      subject: ".harness/lock.yaml",
      detail: loadedLock.error,
    });
  }

  if (harness.upgrade?.policy !== "plan-first") {
    blockers.push(`upgrade policy is '${harness.upgrade?.policy ?? "missing"}', expected 'plan-first'`);
    addOperation(operations, {
      code: "blocked/unsupported-upgrade-policy",
      subject_type: "upgrade-policy",
      subject: harness.upgrade?.policy ?? "missing",
      detail: "expected plan-first upgrade policy",
    });
  }

  if (installedVersion === availableVersion) {
    actions.push("noop: installed harness version matches available package version");
    addOperation(operations, {
      code: "safe/noop",
      subject_type: "harness-version",
      subject: installedVersion,
      detail: "installed harness version matches available package version",
    });
  } else {
    actions.push(`candidate: harness version ${installedVersion} -> ${availableVersion}`);
    addOperation(operations, {
      code: "review/harness-version-change",
      subject_type: "harness-version",
      subject: `${installedVersion} -> ${availableVersion}`,
      detail: "available harness version differs from installed version",
    });
  }

  for (const moduleRef of harness.modules ?? []) {
    const loadedModule = loadModuleDefinition(root, moduleRef.id);
    const module = loadedModule.module;
    const availableModuleVersion = module?.version ?? "unknown";
    let status = "unchanged";
    let detail = "installed module matches local definition";

    if (!module) {
      status = "missing-definition";
      detail = `module definition ${loadedModule.path} is ${loadedModule.error}`;
      blockers.push(`module '${moduleRef.id}' is missing or invalid at modules/${moduleRef.id}/module.yaml`);
      addOperation(operations, {
        code: "blocked/missing-module-definition",
        subject_type: "module",
        subject: moduleRef.id,
        detail,
      });
    } else if (moduleRef.version !== availableModuleVersion) {
      status = "version-change";
      detail = `installed ${moduleRef.version ?? "unknown"} differs from local ${availableModuleVersion}`;
      actions.push(`candidate: module ${moduleRef.id} ${moduleRef.version ?? "unknown"} -> ${availableModuleVersion}`);
      addOperation(operations, {
        code: "review/module-version-change",
        subject_type: "module",
        subject: moduleRef.id,
        detail,
      });
    } else {
      addOperation(operations, {
        code: "safe/noop",
        subject_type: "module",
        subject: moduleRef.id,
        detail,
      });
    }

    modules.push({
      id: moduleRef.id,
      installed_version: moduleRef.version ?? "unknown",
      available_version: availableModuleVersion,
      status,
      detail,
    });
  }

  for (const registryEntry of availableRegistryModules) {
    if (installedIds.has(registryEntry.id)) continue;

    const loadedModule = loadSourceModuleDefinition(registryEntry);
    const isActiveProfileModule = activeProfile.ids.has(registryEntry.id);
    modules.push({
      id: registryEntry.id,
      installed_version: "not-installed",
      available_version: loadedModule.module?.version ?? "unknown",
      status: isActiveProfileModule ? "profile-module-missing" : "available-not-installed",
      detail: loadedModule.module
        ? isActiveProfileModule
          ? "module is required by the active profile but is not installed"
          : "module is available from the source registry but is not installed"
        : `source module definition ${registryEntry.path ?? "unknown"} is ${loadedModule.error}`,
    });

    if (!isActiveProfileModule) {
      addOperation(operations, {
        code: "deferred/installable-module-available",
        subject_type: "module",
        subject: registryEntry.id,
        detail: loadedModule.module
          ? "module is available from the source registry but is not installed"
          : `source module definition ${registryEntry.path ?? "unknown"} is ${loadedModule.error}`,
      });
      continue;
    }

    if (!loadedModule.module) {
      const detail = `source module definition ${registryEntry.path ?? "unknown"} is ${loadedModule.error}`;
      blockers.push(`profile module '${registryEntry.id}' cannot be installed: ${detail}`);
      addOperation(operations, {
        code: "blocked/install-module-unavailable",
        subject_type: "module",
        subject: registryEntry.id,
        detail,
      });
      continue;
    }

    const preflight = planModuleInstall({ root, moduleId: registryEntry.id, force: false, sourceRoot: SOURCE_ROOT });
    if (preflight.ok) {
      actions.push(`applicable: install profile module ${registryEntry.id}`);
      addOperation(operations, {
        code: "safe/install-module",
        subject_type: "module",
        subject: registryEntry.id,
        detail: "active profile requires this module and install preflight found no collisions",
        install: {
          module_id: registryEntry.id,
          artifacts: preflight.artifacts,
        },
      });
      continue;
    }

    for (const error of preflight.errors ?? []) {
      const status = installPreflightStatus(error);
      if (status === "review") {
        warnings.push(`profile module '${registryEntry.id}' needs review before install: ${error}`);
        addOperation(operations, {
          code: "review/install-module-collision",
          subject_type: "module",
          subject: registryEntry.id,
          detail: error,
        });
      } else {
        blockers.push(`profile module '${registryEntry.id}' cannot be installed: ${error}`);
        addOperation(operations, {
          code: "blocked/install-module-unavailable",
          subject_type: "module",
          subject: registryEntry.id,
          detail: error,
        });
      }
    }
  }

  for (const file of harness.managed_files ?? []) {
    const state = managedFileState(root, file, lockByPath, loadedLock.status);
    managedFiles.push(state);
    if (state.status === "missing") {
      blockers.push(`managed file '${state.path}' is missing`);
      addOperation(operations, {
        code: "blocked/missing-managed-file",
        subject_type: "managed-file",
        subject: state.path,
        detail: state.detail,
      });
    } else if (state.status === "present-modified" && state.mode !== "observe") {
      warnings.push(`managed file '${state.path}' differs from lock fingerprint`);
      addOperation(operations, {
        code: "review/modified-managed-file",
        subject_type: "managed-file",
        subject: state.path,
        detail: state.detail,
      });
    } else if (state.status === "present-unlocked" && state.mode !== "observe") {
      warnings.push(`managed file '${state.path}' has no lock fingerprint`);
      addOperation(operations, {
        code: "review/unlocked-managed-file",
        subject_type: "managed-file",
        subject: state.path,
        detail: state.detail,
      });
      addOperation(operations, {
        code: "safe/refresh-lock",
        subject_type: "managed-file",
        subject: state.path,
        detail: "after review, harness lock refresh can add the missing file fingerprint",
      });
    } else if (state.status === "present-unmarked" && state.mode !== "observe") {
      warnings.push(`managed file '${state.path}' lacks harness management marker`);
      addOperation(operations, {
        code: "review/unmarked-managed-file",
        subject_type: "managed-file",
        subject: state.path,
        detail: state.detail,
      });
    } else {
      addOperation(operations, {
        code: "safe/noop",
        subject_type: "managed-file",
        subject: state.path,
        detail: state.detail,
      });
    }
  }

  for (const [name, command] of Object.entries(harness.commands ?? {})) {
    const state = commandStatus(root, command, scripts);
    commands.push({ name, command, ...state });
    if (state.status === "blocker") {
      blockers.push(`command '${name}' is not runnable: ${state.detail}`);
      addOperation(operations, {
        code: "blocked/unrunnable-command",
        subject_type: "command",
        subject: name,
        detail: state.detail,
      });
    } else if (state.status === "repairable") {
      addOperation(operations, {
        code: "safe/repair-command",
        subject_type: "command",
        subject: name,
        detail: state.detail,
        repair: state.repair,
      });
    } else if (state.status === "unknown") {
      warnings.push(`command '${name}' is not mechanically checked`);
      addOperation(operations, {
        code: "review/unchecked-command",
        subject_type: "command",
        subject: name,
        detail: state.detail,
      });
    }
  }

  notes.push("apply is limited to safe/noop, safe/refresh-lock, safe/repair-command, and profile-bounded safe/install-module operations");
  if (activeProfile.error) {
    notes.push(`active source profile could not be loaded; profile-bounded module apply is unavailable: ${activeProfile.error}`);
  }
  if (versionSource.type === "package") {
    if (registryVersion?.status === "available") {
      notes.push(
        `version source is package; registry reports ${versionSource.package}@${versionSource.registry_tag} ${registryVersion.version}`,
      );
    } else if (registryVersion?.status === "unpublished-or-private") {
      notes.push("version source is package; registry package is unpublished or private, using executing package version");
    } else if (registryVersion) {
      notes.push(`version source is package; registry discovery ${registryVersion.status}, using executing package version`);
    } else {
      notes.push("version source is package; using executing package version");
    }
  } else if (versionSource.type === "local-checkout") {
    notes.push("version source is local-checkout for this source repo; package-installed targets use npm registry discovery");
  } else {
    notes.push(`version source is ${versionSource.type}; package registry discovery applies only to package-installed targets`);
  }
  addOperation(operations, {
    code: "deferred/apply-not-implemented",
    subject_type: "upgrade-apply",
    subject: "harness upgrade apply",
    detail: "full file/template upgrade apply is not implemented; limited safe apply is available",
  });

  const upgradeGuidance = upgradeGuidanceFor({
    harness,
    versionSource,
    registryVersion,
    installedVersion,
    availableVersion,
    blockers,
    warnings,
  });

  return {
    ok: true,
    plan: {
      plan_schema_version: PLAN_SCHEMA_VERSION,
      operation_contract_version: OPERATION_CONTRACT_VERSION,
      target: root,
      policy: harness.upgrade?.policy ?? "unknown",
      installed_harness_version: installedVersion,
      available_harness_version: availableVersion,
      profile: harness.profile ?? "unknown",
      source: harness.source ?? {},
      version_source: versionSource,
      upgrade_guidance: upgradeGuidance,
      lock,
      modules,
      managed_files: managedFiles,
      commands,
      operation_summary: summarizeOperations(operations),
      operations,
      actions,
      warnings,
      blockers,
      notes,
    },
  };
}

function applyPlan({ root, plan }) {
  const blockers = plan.operations.filter((operation) => operation.status === "blocked");
  const reviews = plan.operations.filter((operation) => operation.status === "review");
  const unsupportedSafe = plan.operations.filter((operation) =>
    operation.status === "safe" && !SAFE_APPLY_CODES.has(operation.code),
  );
  if (blockers.length > 0 || reviews.length > 0) {
    return {
      ok: false,
      target: root,
      applied: [],
      skipped: plan.operations.filter((operation) => operation.status === "deferred"),
      blockers,
      reviews,
      errors: [
        ...blockers.map((operation) => `${operation.code}: ${operation.subject}`),
        ...reviews.map((operation) => `${operation.code}: ${operation.subject}`),
      ],
    };
  }
  if (unsupportedSafe.length > 0) {
    return {
      ok: false,
      target: root,
      applied: [],
      skipped: plan.operations.filter((operation) => operation.status === "deferred"),
      blockers,
      reviews,
      errors: unsupportedSafe.map((operation) => `${operation.code}: safe operation is not apply-enabled`),
    };
  }

  const applied = [];
  const moduleInstalls = plan.operations.filter((operation) => operation.code === "safe/install-module");
  for (const operation of moduleInstalls) {
    const moduleId = operation.install?.module_id ?? operation.subject;
    const preflight = planModuleInstall({ root, moduleId, force: false, sourceRoot: SOURCE_ROOT });
    if (!preflight.ok) {
      return {
        ok: false,
        target: root,
        applied,
        skipped: plan.operations.filter((item) => item.status === "deferred"),
        blockers,
        reviews,
        errors: (preflight.errors ?? []).map((error) => `${operation.code}: ${moduleId}: ${error}`),
      };
    }
  }

  for (const operation of moduleInstalls) {
    const moduleId = operation.install?.module_id ?? operation.subject;
    const installed = installModule({ root, moduleId, force: false, sourceRoot: SOURCE_ROOT, quiet: true });
    if (!installed.ok) {
      return {
        ok: false,
        target: root,
        applied,
        skipped: plan.operations.filter((item) => item.status === "deferred"),
        blockers,
        reviews,
        errors: (installed.errors ?? []).map((error) => `${operation.code}: ${moduleId}: ${error}`),
      };
    }
    applied.push(installed.noop
      ? `safe/install-module: ${moduleId} already installed`
      : `safe/install-module: ${moduleId}`);
  }

  const commandRepairs = plan.operations.filter((operation) => operation.code === "safe/repair-command");
  for (const operation of commandRepairs) {
    const repair = operation.repair;
    if (repair?.kind !== "package-script" || !repair.script || !repair.value) {
      return {
        ok: false,
        target: root,
        applied,
        skipped: plan.operations.filter((item) => item.status === "deferred"),
        blockers,
        reviews,
        errors: [`${operation.code}: unsupported repair payload for ${operation.subject}`],
      };
    }

    const packagePath = join(root, "package.json");
    if (!existsSync(packagePath)) {
      return {
        ok: false,
        target: root,
        applied,
        skipped: plan.operations.filter((item) => item.status === "deferred"),
        blockers,
        reviews,
        errors: [`${operation.code}: package.json is missing`],
      };
    }

    let packageJson;
    try {
      packageJson = readJsonFile(packagePath);
    } catch (parseError) {
      return {
        ok: false,
        target: root,
        applied,
        skipped: plan.operations.filter((item) => item.status === "deferred"),
        blockers,
        reviews,
        errors: [`${operation.code}: package.json parse error: ${parseError.message}`],
      };
    }

    packageJson.scripts ??= {};
    if (!packageJson.scripts[repair.script]) {
      packageJson.scripts[repair.script] = repair.value;
      writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
      applied.push(`safe/repair-command: package script ${repair.script}`);
    } else {
      applied.push(`safe/repair-command: package script ${repair.script} already present`);
    }
  }

  const refreshLock = plan.operations.some((operation) => operation.code === "safe/refresh-lock");
  if (refreshLock) {
    const loaded = loadManifest(root);
    if (loaded.error) {
      return {
        ok: false,
        target: root,
        applied,
        skipped: [],
        blockers: [],
        reviews: [],
        errors: [loaded.error],
      };
    }

    const generated = createLockFromManifest({
      root,
      harness: loaded.harness,
      generatedAt: new Date().toISOString().slice(0, 10),
    });
    if (generated.missing.length > 0) {
      return {
        ok: false,
        target: root,
        applied,
        skipped: [],
        blockers: [],
        reviews: [],
        errors: generated.missing.map((path) => `${path}: expected lock path is missing`),
      };
    }

    writeLock(root, generated.lock);
    applied.push("safe/refresh-lock: .harness/lock.yaml");
  }

  const noopCount = plan.operations.filter((operation) => operation.code === "safe/noop").length;
  if (noopCount > 0) {
    applied.push(`safe/noop: ${noopCount} operation(s) already satisfied`);
  }

  return {
    ok: true,
    target: root,
    applied,
    skipped: plan.operations.filter((operation) => operation.status === "deferred"),
    blockers,
    reviews,
    errors: [],
  };
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

function printPlan(plan) {
  console.log("Harness upgrade plan");
  console.log(`target: ${plan.target}`);
  console.log(`profile: ${plan.profile}`);
  console.log(`policy: ${plan.policy}`);
  console.log(`version_source: ${plan.version_source.type}`);
  if (plan.version_source.registry) {
    console.log(`registry_status: ${plan.version_source.registry.status}`);
    console.log(`registry_version: ${plan.version_source.registry.version ?? "unknown"}`);
  }
  console.log("upgrade_guidance:");
  console.log(`  model: ${plan.upgrade_guidance.model}`);
  console.log(`  tracking: ${plan.upgrade_guidance.tracking}`);
  console.log(`  source: ${plan.upgrade_guidance.current_instance.source}`);
  console.log(`  boundary: ${plan.upgrade_guidance.source_boundary}`);
  console.log(`  next_action: ${plan.upgrade_guidance.next_operator_action}`);
  console.log("  workflow:");
  plan.upgrade_guidance.operator_workflow.forEach((step, index) => {
    console.log(`    ${index + 1}. ${step}`);
  });
  console.log(`installed_harness_version: ${plan.installed_harness_version}`);
  console.log(`available_harness_version: ${plan.available_harness_version}`);
  console.log("lock:");
  console.log(`  status: ${plan.lock.status}`);
  console.log(`  files: ${plan.lock.files}`);
  console.log(`  ${plan.lock.detail}`);
  console.log("modules:");
  for (const module of plan.modules) {
    console.log(
      `  ${module.id}: ${module.installed_version} -> ${module.available_version} (${module.status})`,
    );
    console.log(`    ${module.detail}`);
  }
  console.log("managed_files:");
  for (const file of plan.managed_files) {
    console.log(`  ${file.path}: ${file.status} (${file.mode}, owner: ${file.owner})`);
    console.log(`    ${file.detail}`);
  }
  console.log("commands:");
  for (const command of plan.commands) {
    console.log(`  ${command.name}: ${command.status} (${command.command})`);
    console.log(`    ${command.detail}`);
  }
  console.log("operations:");
  console.log(`  total: ${plan.operation_summary.total}`);
  for (const [status, count] of Object.entries(plan.operation_summary.by_status)) {
    console.log(`  ${status}: ${count}`);
  }
  for (const operation of plan.operations) {
    console.log(`  ${operation.code}: ${operation.subject_type} ${operation.subject}`);
    console.log(`    ${operation.detail}`);
  }
  printList("actions", plan.actions);
  printList("warnings", plan.warnings);
  printList("blockers", plan.blockers);
  printList("notes", plan.notes);
}

function printApplyResult(result) {
  console.log("Harness upgrade apply");
  console.log(`target: ${result.target}`);
  printList("applied", result.applied);
  printList("skipped", result.skipped.map((operation) => `${operation.code}: ${operation.subject}`));
  printList("blockers", result.blockers.map((operation) => `${operation.code}: ${operation.subject}`));
  printList("reviews", result.reviews.map((operation) => `${operation.code}: ${operation.subject}`));
  printList("errors", result.errors);
}

export function runUpgrade({ cwd = process.cwd(), args = [], registryDiscovery = discoverNpmRegistryVersion } = {}) {
  const root = resolve(cwd);
  const wantsHelp = args.includes("--help") || args.includes("-h") || args[0] === "help";
  const wantsPlan = args.includes("--plan") || args[0] === "plan";
  const wantsApply = args[0] === "apply";
  const wantsJson = args.includes("--json");

  if (wantsHelp || args.length === 0) {
    printHelp();
    return { ok: true };
  }

  if (!wantsPlan && !wantsApply) {
    console.error(`fail unknown upgrade command '${args.join(" ")}'`);
    printHelp();
    return { ok: false };
  }

  const result = buildPlan({ root, registryDiscovery });
  if (!result.ok) {
    console.error(`fail ${result.error}`);
    return result;
  }

  if (wantsPlan) {
    if (wantsJson) {
      console.log(JSON.stringify(result.plan, null, 2));
    } else {
      printPlan(result.plan);
    }
    return result;
  }

  const applied = applyPlan({ root, plan: result.plan });
  if (wantsJson) {
    console.log(JSON.stringify({ plan: result.plan, apply: applied }, null, 2));
  } else {
    printApplyResult(applied);
  }
  return { ok: applied.ok, plan: result.plan, apply: applied };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runUpgrade({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
