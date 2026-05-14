import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(SCRIPT_DIR, "..");

function readPackageVersion() {
  const text = readFileSync(join(SOURCE_ROOT, "package.json"), "utf8");
  return JSON.parse(text).version;
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
  if (!existsSync(path)) return null;

  const moduleYaml = readYamlFile(path);
  return moduleYaml?.module ?? null;
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
  const notes = [];
  const modules = [];

  if (harness.upgrade?.policy !== "plan-first") {
    blockers.push(`upgrade policy is '${harness.upgrade?.policy ?? "missing"}', expected 'plan-first'`);
  }

  if (installedVersion === availableVersion) {
    actions.push("noop: installed harness version matches available package version");
  } else {
    actions.push(`candidate: harness version ${installedVersion} -> ${availableVersion}`);
  }

  for (const moduleRef of harness.modules ?? []) {
    const module = loadModuleDefinition(root, moduleRef.id);
    const availableModuleVersion = module?.version ?? "unknown";
    const status = module
      ? moduleRef.version === availableModuleVersion
        ? "unchanged"
        : "candidate"
      : "missing-definition";

    if (!module) {
      blockers.push(`module '${moduleRef.id}' is missing modules/${moduleRef.id}/module.yaml`);
    }

    modules.push({
      id: moduleRef.id,
      installed_version: moduleRef.version ?? "unknown",
      available_version: availableModuleVersion,
      status,
    });
  }

  for (const file of harness.managed_files ?? []) {
    if (!existsSync(join(root, file.path))) {
      blockers.push(`managed file '${file.path}' is missing`);
    }
  }

  notes.push("apply is not implemented; this command only reports a plan");
  notes.push("remote/package version discovery is not implemented yet");

  return {
    ok: true,
    plan: {
      target: root,
      policy: harness.upgrade?.policy ?? "unknown",
      installed_harness_version: installedVersion,
      available_harness_version: availableVersion,
      profile: harness.profile ?? "unknown",
      source: harness.source ?? {},
      modules,
      actions,
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
  console.log(`installed_harness_version: ${plan.installed_harness_version}`);
  console.log(`available_harness_version: ${plan.available_harness_version}`);
  console.log("modules:");
  for (const module of plan.modules) {
    console.log(
      `  ${module.id}: ${module.installed_version} -> ${module.available_version} (${module.status})`,
    );
  }
  printList("actions", plan.actions);
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
