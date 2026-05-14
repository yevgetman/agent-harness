import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const LOCK_PATH = ".harness/lock.yaml";

function sortByPath(files) {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function managedFileMap(harness) {
  const byPath = new Map();
  for (const file of harness?.managed_files ?? []) {
    if (file?.path && !byPath.has(file.path)) {
      byPath.set(file.path, file);
    }
  }
  return byPath;
}

function moduleIdFromDefinition(path) {
  const match = path.match(/^modules\/([^/]+)\/module\.ya?ml$/);
  return match?.[1] ?? null;
}

function defaultOwner(path, harness) {
  const managed = managedFileMap(harness).get(path);
  if (managed?.owner) return managed.owner;

  const moduleId = moduleIdFromDefinition(path);
  if (moduleId) return moduleId;

  return "harness-lifecycle";
}

function defaultMode(path, harness) {
  const managed = managedFileMap(harness).get(path);
  if (managed?.mode) return managed.mode;

  return "replace";
}

function defaultSource(path, sourceByPath = {}) {
  const source = sourceByPath[path];
  if (typeof source === "string") return source;
  if (source?.source) return source.source;
  if (path === ".harness/manifest.yaml") return "generated-manifest";
  if (moduleIdFromDefinition(path)) return "module-definition";
  return "generated";
}

function defaultSourcePath(path, sourceByPath = {}) {
  const source = sourceByPath[path];
  if (typeof source === "string" && source.startsWith("module-template:")) {
    return source.replace(/^module-template:/, "");
  }
  if (source?.source_path) return source.source_path;
  if (moduleIdFromDefinition(path)) return path;
  return null;
}

function defaultSourceSha(root, sourcePath) {
  if (!root || !sourcePath) return null;
  const fullPath = join(root, sourcePath);
  return existsSync(fullPath) ? hashFile(root, sourcePath) : null;
}

function sourceShaFor({ root = null, path, content = null, sourceByPath = {} }) {
  const source = sourceByPath[path];
  if (source?.source_sha256) return source.source_sha256;

  const sourcePath = defaultSourcePath(path, sourceByPath);
  const sourceSha = defaultSourceSha(root, sourcePath);
  if (sourceSha) return sourceSha;

  if (sourcePath === path && content != null) return sha256(content);
  return null;
}

function withOptionalSourceFields(entry, { root = null, content = null, sourceByPath = {} } = {}) {
  const sourcePath = defaultSourcePath(entry.path, sourceByPath);
  const sourceSha = sourceShaFor({ root, path: entry.path, content, sourceByPath });
  return {
    ...entry,
    ...(sourcePath ? { source_path: sourcePath } : {}),
    ...(sourceSha ? { source_sha256: sourceSha } : {}),
  };
}

function moduleArtifactPaths(root, harness) {
  if (!root) return [];

  const paths = [];
  for (const moduleRef of harness?.modules ?? []) {
    if (!moduleRef?.id) continue;
    const modulePath = join(root, "modules", moduleRef.id, "module.yaml");
    if (!existsSync(modulePath)) continue;

    try {
      const moduleYaml = readYamlFile(modulePath);
      for (const artifact of moduleYaml?.module?.install?.artifacts ?? []) {
        if (artifact?.type !== "directory" && artifact?.path) {
          paths.push(artifact.path);
        }
      }
    } catch {
      // Shape and parse errors are reported by doctor; lock commands only use
      // readable module definitions to discover additional artifact paths.
    }
  }

  return paths;
}

export function expectedLockPaths(harness, { root = null } = {}) {
  const paths = new Set([".harness/manifest.yaml"]);
  for (const file of harness?.managed_files ?? []) {
    if (file?.path) paths.add(file.path);
  }
  for (const moduleRef of harness?.modules ?? []) {
    if (moduleRef?.id) paths.add(`modules/${moduleRef.id}/module.yaml`);
  }
  for (const path of moduleArtifactPaths(root, harness)) {
    paths.add(path);
  }
  return Array.from(paths).sort();
}

function normalizeLockFiles(files) {
  return sortByPath(files)
    .filter((file) => file.path !== LOCK_PATH)
    .map((file) => ({
      path: file.path,
      owner: file.owner ?? "harness-lifecycle",
      mode: file.mode ?? "replace",
      source: file.source ?? "generated",
      ...(file.source_path ? { source_path: file.source_path } : {}),
      ...(file.source_sha256 ? { source_sha256: file.source_sha256 } : {}),
      sha256: file.sha256,
    }));
}

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function hashFile(root, path) {
  return sha256(readFileSync(join(root, path)));
}

export function lockEntryForContent({ path, content, harness, sourceByPath = {} }) {
  return withOptionalSourceFields({
    path,
    owner: defaultOwner(path, harness),
    mode: defaultMode(path, harness),
    source: defaultSource(path, sourceByPath),
    sha256: sha256(content),
  }, { content, sourceByPath });
}

export function lockEntriesFromPlannedEntries(entries, harness, sourceByPath = {}) {
  return entries
    .filter((entry) => entry.type !== "directory" && entry.path !== LOCK_PATH)
    .map((entry) => {
      const entrySourceByPath = entry.lock_source
        ? { ...sourceByPath, [entry.path]: entry.lock_source }
        : sourceByPath;
      return lockEntryForContent({
        path: entry.path,
        content: entry.content,
        harness,
        sourceByPath: entrySourceByPath,
      });
    });
}

export function lockEntriesFromPaths(root, paths, harness, sourceByPath = {}) {
  return paths
    .filter((path) => path !== LOCK_PATH)
    .filter((path) => existsSync(join(root, path)))
    .map((path) => withOptionalSourceFields({
      path,
      owner: defaultOwner(path, harness),
      mode: defaultMode(path, harness),
      source: defaultSource(path, sourceByPath),
      sha256: hashFile(root, path),
    }, { root, sourceByPath }));
}

export function createLock({ harness, generatedAt, files = [] }) {
  return {
    version: 1,
    generated_at: generatedAt,
    package: harness?.source?.package ?? "portable-harness",
    harness_version: String(harness?.harness_version ?? "unknown"),
    profile: harness?.profile ?? "unknown",
    source: harness?.source ?? {},
    modules: (harness?.modules ?? []).map((moduleRef) => ({
      id: moduleRef.id,
      version: moduleRef.version ?? "unknown",
    })),
    files: normalizeLockFiles(files),
  };
}

export function readLock(root) {
  const path = join(root, LOCK_PATH);
  if (!existsSync(path)) {
    return { status: "missing", lock: null, error: `${LOCK_PATH}: missing` };
  }

  try {
    const yaml = parseYaml(readFileSync(path, "utf8"));
    if (!yaml?.lock) {
      return { status: "invalid", lock: null, error: `${LOCK_PATH}: missing top-level lock key` };
    }

    return { status: "present", lock: yaml.lock, error: null };
  } catch (parseError) {
    return { status: "invalid", lock: null, error: `${LOCK_PATH}: YAML parse error: ${parseError.message}` };
  }
}

export function writeLock(root, lock) {
  const path = join(root, LOCK_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyYaml({ lock: { ...lock, files: normalizeLockFiles(lock.files ?? []) } }));
}

export function lockFileMap(lock) {
  const files = new Map();
  for (const file of lock?.files ?? []) {
    if (file?.path) files.set(file.path, file);
  }
  return files;
}

export function mergeLockFiles(current = [], updates = []) {
  const byPath = new Map();
  for (const file of current) {
    if (file?.path && file.path !== LOCK_PATH) byPath.set(file.path, file);
  }
  for (const file of updates) {
    if (file?.path && file.path !== LOCK_PATH) byPath.set(file.path, file);
  }
  return normalizeLockFiles(Array.from(byPath.values()));
}

export function updateLockFromPaths({ root, harness, paths, generatedAt, sourceByPath = {} }) {
  const loaded = readLock(root);
  const base = loaded.lock ?? createLock({ harness, generatedAt, files: [] });
  const files = lockEntriesFromPaths(root, paths, harness, sourceByPath);
  const lock = createLock({
    harness,
    generatedAt,
    files: mergeLockFiles(base.files ?? [], files),
  });
  writeLock(root, lock);
  return lock;
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
    return { manifest, harness: manifest.harness };
  } catch (parseError) {
    return { error: `.harness/manifest.yaml: YAML parse error: ${parseError.message}` };
  }
}

export function createLockFromManifest({ root, harness, generatedAt }) {
  const paths = expectedLockPaths(harness, { root });
  const missing = paths.filter((path) => !existsSync(join(root, path)));
  const files = lockEntriesFromPaths(root, paths, harness, sourceByPathFromManifest(root, harness));
  return {
    paths,
    missing,
    lock: createLock({ harness, generatedAt, files }),
  };
}

function metadataDrift(current, expected) {
  const drift = [];
  for (const key of ["package", "harness_version", "profile"]) {
    if (String(current?.[key] ?? "") !== String(expected?.[key] ?? "")) {
      drift.push(`metadata.${key}: ${current?.[key] ?? "missing"} -> ${expected?.[key] ?? "missing"}`);
    }
  }

  if (JSON.stringify(current?.source ?? {}) !== JSON.stringify(expected?.source ?? {})) {
    drift.push("metadata.source: differs from manifest source");
  }

  if (JSON.stringify(current?.modules ?? []) !== JSON.stringify(expected?.modules ?? [])) {
    drift.push("metadata.modules: differs from manifest modules");
  }

  return drift;
}

function fileDrift(currentLock, expectedLock) {
  const drift = [];
  const currentFiles = lockFileMap(currentLock);
  const expectedFiles = lockFileMap(expectedLock);

  for (const [path, expected] of expectedFiles.entries()) {
    const current = currentFiles.get(path);
    if (!current) {
      drift.push(`${path}: missing lock entry`);
      continue;
    }

    for (const key of ["owner", "mode", "source", "source_path", "source_sha256", "sha256"]) {
      if (String(current[key] ?? "") !== String(expected[key] ?? "")) {
        drift.push(`${path}: ${key} differs from current file state`);
        break;
      }
    }
  }

  for (const path of currentFiles.keys()) {
    if (!expectedFiles.has(path)) {
      drift.push(`${path}: stale lock entry`);
    }
  }

  return drift;
}

export function checkLockState({ root, generatedAt = todayIso() }) {
  const loadedManifest = loadManifest(root);
  if (loadedManifest.error) {
    return {
      ok: false,
      root,
      errors: [loadedManifest.error],
      drift: [],
      missing: [],
      lock: null,
    };
  }

  const expected = createLockFromManifest({
    root,
    harness: loadedManifest.harness,
    generatedAt,
  });
  const loadedLock = readLock(root);
  const errors = [];

  if (loadedLock.status !== "present") {
    errors.push(loadedLock.error);
  }

  for (const path of expected.missing) {
    errors.push(`${path}: expected lock path is missing`);
  }

  const drift = loadedLock.lock
    ? [
      ...metadataDrift(loadedLock.lock, expected.lock),
      ...fileDrift(loadedLock.lock, expected.lock),
    ]
    : [];

  return {
    ok: errors.length === 0 && drift.length === 0,
    root,
    errors,
    drift,
    missing: expected.missing,
    lock: loadedLock.lock,
    expectedLock: expected.lock,
  };
}

function sourceByPathFromManifest(root, harness) {
  const sourceByPath = {};
  for (const moduleRef of harness?.modules ?? []) {
    if (!moduleRef?.id) continue;

    const modulePath = `modules/${moduleRef.id}/module.yaml`;
    sourceByPath[modulePath] = {
      source: "module-definition",
      source_path: modulePath,
      source_sha256: existsSync(join(root, modulePath)) ? hashFile(root, modulePath) : null,
    };

    const fullModulePath = join(root, modulePath);
    if (!existsSync(fullModulePath)) continue;

    try {
      const moduleYaml = readYamlFile(fullModulePath);
      for (const artifact of moduleYaml?.module?.install?.artifacts ?? []) {
        if (artifact?.type !== "directory" && artifact?.path && artifact?.source) {
          const sourcePath = artifact.source;
          sourceByPath[artifact.path] = {
            source: "module-template",
            source_path: sourcePath,
            source_sha256: defaultSourceSha(root, sourcePath),
          };
        }
      }
    } catch {
      // Doctor reports parse/shape issues. Lock provenance uses readable
      // module definitions opportunistically.
    }
  }
  return sourceByPath;
}

function printItems(label, items) {
  console.log(`${label}:`);
  if (items.length === 0) {
    console.log("  none");
    return;
  }

  for (const item of items) {
    console.log(`  ${item}`);
  }
}

function printLockHelp() {
  console.log(`harness lock

Usage:
  harness lock refresh [--target <path>]
  harness lock check [--target <path>]
  harness lock refresh --check [--target <path>]

Commands:
  refresh   Rebuild .harness/lock.yaml from the installed manifest and current files.
  check     Report whether .harness/lock.yaml matches current installed state.
`);
}

function runCheck(root) {
  const result = checkLockState({ root });
  console.log("Harness lock check");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "drift-or-error"}`);
  printItems("errors", result.errors);
  printItems("drift", result.drift);
  return result;
}

function runRefresh(root) {
  const loadedManifest = loadManifest(root);
  if (loadedManifest.error) {
    console.error(`fail ${loadedManifest.error}`);
    return { ok: false, root, errors: [loadedManifest.error] };
  }

  const generated = createLockFromManifest({
    root,
    harness: loadedManifest.harness,
    generatedAt: todayIso(),
  });

  if (generated.missing.length > 0) {
    for (const path of generated.missing) {
      console.error(`fail ${path}: expected lock path is missing`);
    }
    return { ok: false, root, errors: generated.missing };
  }

  writeLock(root, generated.lock);
  console.log("Harness lock refresh");
  console.log(`target: ${root}`);
  console.log(`files: ${generated.lock.files.length}`);
  console.log("status: refreshed");
  return { ok: true, root, lock: generated.lock, files: generated.lock.files.length };
}

export function runLock({ cwd = process.cwd(), args = [] } = {}) {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printLockHelp();
    return { ok: true };
  }

  const commandArgs = subcommand === "refresh" || subcommand === "check" ? rest : args;
  const targetArg = argValue(commandArgs, "--target", cwd);
  const root = resolve(cwd, targetArg);

  if (subcommand === "check" || (subcommand === "refresh" && rest.includes("--check"))) {
    return runCheck(root);
  }

  if (subcommand === "refresh") {
    return runRefresh(root);
  }

  console.error(`fail unknown lock command '${subcommand}'`);
  printLockHelp();
  return { ok: false };
}

export { LOCK_PATH };
