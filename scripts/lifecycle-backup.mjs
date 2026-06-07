import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { sha256 } from "./lock.mjs";

export const DEFAULT_BACKUP_ROOT = ".harness/backups";
export const DESTROY_BACKUP_ROOT = ".harness-destroy-backups";
let backupCounter = 0;

function normalizeRelPath(path) {
  return String(path ?? "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function safeTargetPath(root, relPath) {
  const normalized = normalizeRelPath(relPath);
  const full = resolve(root, normalized);
  const resolvedRoot = resolve(root);
  if (full !== resolvedRoot && !full.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`${relPath}: path escapes target root`);
  }
  return full;
}

function ensureParent(file) {
  mkdirSync(dirname(file), { recursive: true });
}

function safePurpose(purpose) {
  return normalizeRelPath(purpose)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "mutation";
}

function backupId(purpose, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:.]/g, "");
  backupCounter += 1;
  return `${stamp}-${String(backupCounter).padStart(4, "0")}-${safePurpose(purpose)}`;
}

function excludedPath(relPath, excludeRoots) {
  const normalized = normalizeRelPath(relPath);
  if (!normalized || normalized === ".git" || normalized.startsWith(".git/")) return true;
  return excludeRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

function collectDirectoryFiles({ root, relPath, files, skipped, excludeRoots }) {
  const normalized = normalizeRelPath(relPath);
  if (excludedPath(normalized, excludeRoots)) {
    skipped.push({ path: normalized, reason: "excluded" });
    return;
  }

  const full = safeTargetPath(root, normalized);
  for (const entry of readdirSync(full).sort()) {
    const child = normalizeRelPath(`${normalized}/${entry}`);
    if (excludedPath(child, excludeRoots)) {
      skipped.push({ path: child, reason: "excluded" });
      continue;
    }

    const childFull = safeTargetPath(root, child);
    const stat = statSync(childFull);
    if (stat.isDirectory()) {
      collectDirectoryFiles({ root, relPath: child, files, skipped, excludeRoots });
    } else {
      files.add(child);
    }
  }
}

function collectBackupInputs({ root, paths, directories, backupRoot }) {
  const files = new Set();
  const missing = [];
  const skipped = [];
  const excludeRoots = [
    normalizeRelPath(DEFAULT_BACKUP_ROOT),
    normalizeRelPath(DESTROY_BACKUP_ROOT),
    normalizeRelPath(backupRoot),
  ].filter(Boolean);

  for (const inputPath of paths ?? []) {
    const relPath = normalizeRelPath(inputPath);
    if (!relPath) continue;
    if (excludedPath(relPath, excludeRoots)) {
      skipped.push({ path: relPath, reason: "excluded" });
      continue;
    }

    const full = safeTargetPath(root, relPath);
    if (!existsSync(full)) {
      missing.push(relPath);
      continue;
    }

    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectDirectoryFiles({ root, relPath, files, skipped, excludeRoots });
    } else {
      files.add(relPath);
    }
  }

  for (const inputPath of directories ?? []) {
    const relPath = normalizeRelPath(inputPath);
    if (!relPath) continue;
    if (excludedPath(relPath, excludeRoots)) {
      skipped.push({ path: relPath, reason: "excluded" });
      continue;
    }

    const full = safeTargetPath(root, relPath);
    if (!existsSync(full)) {
      missing.push(relPath);
      continue;
    }
    if (!statSync(full).isDirectory()) {
      files.add(relPath);
      continue;
    }

    collectDirectoryFiles({ root, relPath, files, skipped, excludeRoots });
  }

  return {
    files: Array.from(files).sort(),
    missing: Array.from(new Set(missing)).sort(),
    skipped,
  };
}

export function createLifecycleBackup({
  root,
  purpose,
  paths = [],
  directories = [],
  backupRoot = DEFAULT_BACKUP_ROOT,
  metadata = {},
} = {}) {
  const normalizedBackupRoot = normalizeRelPath(backupRoot || DEFAULT_BACKUP_ROOT);
  const collected = collectBackupInputs({
    root,
    paths,
    directories,
    backupRoot: normalizedBackupRoot,
  });

  const createdAt = new Date().toISOString();
  if (collected.files.length === 0) {
    return {
      created: false,
      purpose,
      backup_root: normalizedBackupRoot,
      path: null,
      manifest: null,
      files: [],
      missing: collected.missing,
      skipped: collected.skipped,
    };
  }

  const backupRel = normalizeRelPath(`${normalizedBackupRoot}/${backupId(purpose, new Date(createdAt))}`);
  const fileRecords = [];
  for (const relPath of collected.files) {
    const sourcePath = safeTargetPath(root, relPath);
    const backupPath = normalizeRelPath(`${backupRel}/files/${relPath}`);
    const fullBackupPath = safeTargetPath(root, backupPath);
    ensureParent(fullBackupPath);
    copyFileSync(sourcePath, fullBackupPath);
    fileRecords.push({
      path: relPath,
      backup_path: backupPath,
      sha256: sha256(readFileSync(sourcePath)),
    });
  }

  const manifestRel = normalizeRelPath(`${backupRel}/backup.yaml`);
  const manifest = {
    backup: {
      version: 1,
      purpose,
      created_at: createdAt,
      target: resolve(root),
      files: fileRecords,
      missing: collected.missing,
      skipped: collected.skipped,
      metadata,
    },
  };
  const manifestPath = safeTargetPath(root, manifestRel);
  ensureParent(manifestPath);
  writeFileSync(manifestPath, stringifyYaml(manifest));

  return {
    created: true,
    purpose,
    backup_root: normalizedBackupRoot,
    path: backupRel,
    manifest: manifestRel,
    files: fileRecords,
    missing: collected.missing,
    skipped: collected.skipped,
  };
}
