import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { hashFile, updateLockFromPaths } from "./lock.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(SCRIPT_DIR, "..");

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
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

function ensureParent(file) {
  mkdirSync(dirname(file), { recursive: true });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function loadRegistry(sourceRoot = SOURCE_ROOT) {
  const path = join(sourceRoot, "modules", "registry.yaml");
  if (!existsSync(path)) {
    return { error: "modules/registry.yaml: missing" };
  }

  try {
    const registry = readYamlFile(path);
    if (!Array.isArray(registry?.modules)) {
      return { error: "modules/registry.yaml: modules must be a list" };
    }

    return { modules: registry.modules };
  } catch (parseError) {
    return { error: `modules/registry.yaml: YAML parse error: ${parseError.message}` };
  }
}

export function loadSourceModule(moduleId, sourceRoot = SOURCE_ROOT) {
  const registry = loadRegistry(sourceRoot);
  if (registry.error) return { error: registry.error };

  const entry = registry.modules.find((module) => module.id === moduleId);
  if (!entry) return { error: `unknown module '${moduleId}'` };

  const modulePath = join(sourceRoot, entry.path);
  if (!existsSync(modulePath)) {
    return { error: `${entry.path}: missing` };
  }

  let moduleYaml;
  try {
    moduleYaml = readYamlFile(modulePath);
  } catch (parseError) {
    return { error: `${entry.path}: YAML parse error: ${parseError.message}` };
  }

  const module = moduleYaml?.module;
  if (!module) return { error: `${entry.path}: missing top-level module key` };
  if (module.id !== moduleId) return { error: `${entry.path}: module id '${module.id}' does not match '${moduleId}'` };
  return { entry, module, modulePath };
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
  return new Set((harness.modules ?? []).map((module) => module.id).filter(Boolean));
}

function commandCollisionErrors(harness, module, force) {
  if (force || !module.commands) return [];

  const errors = [];
  const commands = harness.commands ?? {};
  for (const [name, command] of Object.entries(module.commands)) {
    if (commands[name] && commands[name] !== command) {
      errors.push(`command '${name}' already exists with different value`);
    }
  }
  return errors;
}

function plannedArtifacts(root, module, moduleId) {
  const artifacts = [
    {
      path: `modules/${moduleId}/module.yaml`,
      type: "template",
      source: `modules/${moduleId}/module.yaml`,
    },
  ];

  for (const artifact of module.install?.artifacts ?? []) {
    artifacts.push(artifact);
  }

  return artifacts.map((artifact) => ({
    ...artifact,
    targetPath: join(root, artifact.path),
  }));
}

function artifactSourceErrors(artifacts, sourceRoot) {
  const errors = [];
  for (const artifact of artifacts) {
    if (artifact.type === "directory") continue;

    if (artifact.type !== "template") {
      errors.push(`${artifact.path}: unsupported artifact type '${artifact.type}'`);
      continue;
    }

    const source = join(sourceRoot, artifact.source);
    if (!existsSync(source)) {
      errors.push(`${artifact.source}: source template missing`);
    }
  }
  return errors;
}

function artifactCollisionErrors(artifacts, force) {
  if (force) return [];

  const errors = [];
  for (const artifact of artifacts) {
    if (artifact.type === "directory") continue;
    if (existsSync(artifact.targetPath)) {
      errors.push(`${artifact.path}: already exists (pass --force to overwrite)`);
    }
  }
  return errors;
}

function writeArtifact(root, artifact, sourceRoot) {
  if (artifact.type === "directory") {
    mkdirSync(artifact.targetPath, { recursive: true });
    return;
  }

  const source = join(sourceRoot, artifact.source);

  ensureParent(artifact.targetPath);
  writeFileSync(artifact.targetPath, readFileSync(source, "utf8"));
}

function upsertManagedFiles(harness, moduleId, managedFiles = []) {
  harness.managed_files ??= [];

  for (const file of managedFiles) {
    const existing = harness.managed_files.find((entry) => entry.path === file.path && entry.owner === moduleId);
    if (existing) {
      existing.mode = file.mode ?? existing.mode;
      continue;
    }

    harness.managed_files.push({
      path: file.path,
      owner: moduleId,
      mode: file.mode ?? "merge",
    });
  }
}

function upsertCommands(harness, commands = {}) {
  harness.commands ??= {};
  for (const [name, command] of Object.entries(commands)) {
    harness.commands[name] = command;
  }
}

function prepareModuleInstall({ root, moduleId, force = false, sourceRoot = SOURCE_ROOT }) {
  const source = loadSourceModule(moduleId, sourceRoot);
  if (source.error) return { ok: false, errors: [source.error] };

  const target = loadTargetManifest(root);
  if (target.error) return { ok: false, errors: [target.error] };

  if (installedIds(target.harness).has(moduleId)) {
    return { ok: true, moduleId, installed: false, noop: true };
  }

  if (source.entry.installable === false) {
    return { ok: false, errors: [`module '${moduleId}' is not installable`] };
  }

  const artifacts = plannedArtifacts(root, source.module, moduleId);
  const errors = [
    ...artifactSourceErrors(artifacts, sourceRoot),
    ...artifactCollisionErrors(artifacts, force),
    ...commandCollisionErrors(target.harness, source.module, force),
  ];

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    moduleId,
    source,
    target,
    artifacts,
    installed: true,
  };
}

export function planModuleInstall({ root, moduleId, force = false, sourceRoot = SOURCE_ROOT }) {
  const prepared = prepareModuleInstall({ root, moduleId, force, sourceRoot });
  if (!prepared.ok) {
    return { ok: false, moduleId, errors: prepared.errors };
  }

  return {
    ok: true,
    moduleId,
    installed: prepared.installed,
    noop: prepared.noop ?? false,
    artifacts: (prepared.artifacts ?? []).map((artifact) => ({
      path: artifact.path,
      type: artifact.type,
      ...(artifact.source ? { source: artifact.source } : {}),
    })),
  };
}

export function installModule({ root, moduleId, force, sourceRoot = SOURCE_ROOT }) {
  const prepared = prepareModuleInstall({ root, moduleId, force, sourceRoot });
  if (!prepared.ok) return { ok: false, errors: prepared.errors };

  if (prepared.noop) {
    console.log(`module '${moduleId}' already installed`);
    return { ok: true, moduleId, installed: false, noop: true };
  }

  const { source, target, artifacts } = prepared;

  for (const artifact of artifacts) {
    writeArtifact(root, artifact, sourceRoot);
  }

  target.harness.modules ??= [];
  target.harness.modules.push({
    id: source.module.id,
    version: source.module.version,
    status: source.module.status ?? "active",
    process_domains: source.module.process_domains ?? [],
  });

  upsertManagedFiles(target.harness, source.module.id, source.module.managed_files);
  upsertCommands(target.harness, source.module.commands);

  writeFileSync(target.path, stringifyYaml(target.manifest));
  const changedPaths = [".harness/manifest.yaml"];
  const sourceByPath = {};
  for (const artifact of artifacts) {
    if (artifact.type === "directory") continue;
    changedPaths.push(artifact.path);
    sourceByPath[artifact.path] = artifact.path === `modules/${moduleId}/module.yaml`
      ? {
        source: "module-definition",
        source_path: artifact.source,
        source_sha256: hashFile(sourceRoot, artifact.source),
      }
      : {
        source: "module-template",
        source_path: artifact.source,
        source_sha256: hashFile(sourceRoot, artifact.source),
      };
  }
  updateLockFromPaths({
    root,
    harness: target.harness,
    paths: changedPaths,
    generatedAt: todayIso(),
    sourceByPath,
  });
  console.log(`installed module '${moduleId}'`);
  return { ok: true, moduleId, installed: true };
}

function runList({ root, sourceRoot }) {
  const registry = loadRegistry(sourceRoot);
  if (registry.error) {
    console.error(`fail ${registry.error}`);
    return { ok: false };
  }

  const target = loadTargetManifest(root);
  const installed = target.error ? new Set() : installedIds(target.harness);

  const modules = registry.modules.map((module) => ({
    id: module.id,
    status: module.status ?? "unknown",
    installable: module.installable !== false,
    installed: installed.has(module.id),
  }));

  for (const module of modules) {
    const installedLabel = module.installed ? "installed" : "available";
    const installableLabel = module.installable ? "installable" : "not-installable";
    console.log(`${module.id} ${module.status} ${installedLabel} ${installableLabel}`);
  }

  return { ok: true, modules };
}

function printHelp() {
  console.log(`harness modules

Usage:
  harness modules list [--target <path>]
  harness modules add <module-id> [--target <path>] [--force]
`);
}

export function runModules({ cwd = process.cwd(), args = [], sourceRoot = SOURCE_ROOT } = {}) {
  const [subcommand, ...rest] = args;
  const targetArg = argValue(rest, "--target", cwd);
  const root = resolve(cwd, targetArg);
  const force = rest.includes("--force");

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return { ok: true };
  }

  if (subcommand === "list") {
    return runList({ root, sourceRoot });
  }

  if (subcommand === "add") {
    const [moduleId] = positionalArgs(rest);
    if (!moduleId) {
      console.error("fail modules add requires a module id");
      return { ok: false };
    }

    const result = installModule({ root, moduleId, force, sourceRoot });
    if (!result.ok) {
      for (const error of result.errors) {
        console.error(`fail ${error}`);
      }
    }
    return result;
  }

  console.error(`fail unknown modules command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runModules({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
