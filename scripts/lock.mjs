import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const LOCK_PATH = ".harness/lock.yaml";

function sortByPath(files) {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
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
  if (sourceByPath[path]) return sourceByPath[path];
  if (path === ".harness/manifest.yaml") return "generated-manifest";
  if (moduleIdFromDefinition(path)) return "module-definition";
  return "generated";
}

function normalizeLockFiles(files) {
  return sortByPath(files)
    .filter((file) => file.path !== LOCK_PATH)
    .map((file) => ({
      path: file.path,
      owner: file.owner ?? "harness-lifecycle",
      mode: file.mode ?? "replace",
      source: file.source ?? "generated",
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
  return {
    path,
    owner: defaultOwner(path, harness),
    mode: defaultMode(path, harness),
    source: defaultSource(path, sourceByPath),
    sha256: sha256(content),
  };
}

export function lockEntriesFromPlannedEntries(entries, harness, sourceByPath = {}) {
  return entries
    .filter((entry) => entry.type !== "directory" && entry.path !== LOCK_PATH)
    .map((entry) => lockEntryForContent({
      path: entry.path,
      content: entry.content,
      harness,
      sourceByPath,
    }));
}

export function lockEntriesFromPaths(root, paths, harness, sourceByPath = {}) {
  return paths
    .filter((path) => path !== LOCK_PATH)
    .filter((path) => existsSync(join(root, path)))
    .map((path) => ({
      path,
      owner: defaultOwner(path, harness),
      mode: defaultMode(path, harness),
      source: defaultSource(path, sourceByPath),
      sha256: hashFile(root, path),
    }));
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

export { LOCK_PATH };
