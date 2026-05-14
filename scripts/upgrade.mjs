import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(SCRIPT_DIR, "..");

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readPackageVersion() {
  return readJsonFile(join(SOURCE_ROOT, "package.json")).version;
}

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function printHelp() {
  console.log(`harness upgrade

Usage:
  harness upgrade --plan
  harness upgrade plan

The upgrade command is currently plan-only. It does not write files.
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

function loadPackageScripts(root) {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;

  try {
    return readJsonFile(path).scripts ?? {};
  } catch {
    return null;
  }
}

function commandStatus(root, command, scripts) {
  if (typeof command !== "string" || command.trim() === "") {
    return { status: "blocker", detail: "command must be a non-empty string" };
  }

  if (command === "npm test") {
    if (!scripts) return { status: "blocker", detail: "package.json is missing or invalid" };
    return scripts.test
      ? { status: "present", detail: "package script test exists" }
      : { status: "blocker", detail: "package script test is missing" };
  }

  const npmRun = command.match(/^npm run ([^\s]+)$/);
  if (npmRun) {
    if (!scripts) return { status: "blocker", detail: "package.json is missing or invalid" };
    const script = npmRun[1];
    return scripts[script]
      ? { status: "present", detail: `package script ${script} exists` }
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

function managedFileState(root, file) {
  const path = join(root, file.path);
  if (!existsSync(path)) {
    return {
      path: file.path,
      owner: file.owner ?? "unknown",
      mode: file.mode ?? "unknown",
      status: "missing",
      detail: "managed file is missing",
    };
  }

  const text = readFileSync(path, "utf8");
  const hasHarnessMarker = [
    "Harness metadata:",
    "Harness managed file:",
    "Installed harness package:",
    "\nharness:\n",
  ].some((marker) => text.includes(marker));
  const status = hasHarnessMarker ? "present-managed" : "present-unmarked";
  const detail = status === "present-managed"
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

function collectAvailableModuleIds(root, installedIds) {
  return Array.from(installedIds).filter((id) => existsSync(join(root, "modules", id, "module.yaml")));
}

function buildPlan({ root }) {
  const loaded = loadManifest(root);
  if (loaded.error) {
    return { ok: false, error: loaded.error };
  }

  const harness = loaded.harness;
  const availableVersion = readPackageVersion();
  const installedVersion = String(harness.harness_version ?? "unknown");
  const actions = [];
  const blockers = [];
  const warnings = [];
  const notes = [];
  const modules = [];
  const commands = [];
  const managedFiles = [];
  const scripts = loadPackageScripts(root);
  const installedIds = uniqueInstalledModuleIds(harness.modules);
  const availableModuleIds = collectAvailableModuleIds(root, installedIds);

  if (harness.upgrade?.policy !== "plan-first") {
    blockers.push(`upgrade policy is '${harness.upgrade?.policy ?? "missing"}', expected 'plan-first'`);
  }

  if (installedVersion === availableVersion) {
    actions.push("noop: installed harness version matches available package version");
  } else {
    actions.push(`candidate: harness version ${installedVersion} -> ${availableVersion}`);
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
    } else if (moduleRef.version !== availableModuleVersion) {
      status = "version-change";
      detail = `installed ${moduleRef.version ?? "unknown"} differs from local ${availableModuleVersion}`;
      actions.push(`candidate: module ${moduleRef.id} ${moduleRef.version ?? "unknown"} -> ${availableModuleVersion}`);
    }

    modules.push({
      id: moduleRef.id,
      installed_version: moduleRef.version ?? "unknown",
      available_version: availableModuleVersion,
      status,
      detail,
    });
  }

  for (const id of availableModuleIds) {
    if (!installedIds.has(id)) {
      modules.push({
        id,
        installed_version: "not-installed",
        available_version: loadModuleDefinition(root, id).module?.version ?? "unknown",
        status: "available-not-installed",
        detail: "module definition exists locally but is not installed",
      });
    }
  }

  for (const file of harness.managed_files ?? []) {
    const state = managedFileState(root, file);
    managedFiles.push(state);
    if (state.status === "missing") {
      blockers.push(`managed file '${state.path}' is missing`);
    } else if (state.status === "present-unmarked" && state.mode !== "observe") {
      warnings.push(`managed file '${state.path}' lacks harness management marker`);
    }
  }

  for (const [name, command] of Object.entries(harness.commands ?? {})) {
    const state = commandStatus(root, command, scripts);
    commands.push({ name, command, ...state });
    if (state.status === "blocker") {
      blockers.push(`command '${name}' is not runnable: ${state.detail}`);
    } else if (state.status === "unknown") {
      warnings.push(`command '${name}' is not mechanically checked`);
    }
  }

  notes.push("apply is not implemented; this command only reports a plan");
  notes.push("version source is local-checkout; external package discovery is deferred");

  return {
    ok: true,
    plan: {
      target: root,
      policy: harness.upgrade?.policy ?? "unknown",
      installed_harness_version: installedVersion,
      available_harness_version: availableVersion,
      profile: harness.profile ?? "unknown",
      source: harness.source ?? {},
      version_source: {
        type: "local-checkout",
        harness_package: "package.json",
        modules: "modules/<id>/module.yaml",
      },
      modules,
      managed_files: managedFiles,
      commands,
      actions,
      warnings,
      blockers,
      notes,
    },
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
  console.log(`installed_harness_version: ${plan.installed_harness_version}`);
  console.log(`available_harness_version: ${plan.available_harness_version}`);
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
  printList("actions", plan.actions);
  printList("warnings", plan.warnings);
  printList("blockers", plan.blockers);
  printList("notes", plan.notes);
}

export function runUpgrade({ cwd = process.cwd(), args = [] } = {}) {
  const root = resolve(cwd);
  const wantsHelp = args.includes("--help") || args.includes("-h") || args[0] === "help";
  const wantsPlan = args.includes("--plan") || args[0] === "plan";

  if (wantsHelp || args.length === 0) {
    printHelp();
    return { ok: true };
  }

  if (!wantsPlan) {
    console.error(`fail unknown upgrade command '${args.join(" ")}'`);
    printHelp();
    return { ok: false };
  }

  const result = buildPlan({ root });
  if (!result.ok) {
    console.error(`fail ${result.error}`);
    return result;
  }

  printPlan(result.plan);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runUpgrade({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
