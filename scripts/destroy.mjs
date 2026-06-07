#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createLifecycleBackup, DESTROY_BACKUP_ROOT } from "./lifecycle-backup.mjs";
import { sha256 } from "./lock.mjs";

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function printHelp() {
  console.log(`harness destroy

Usage:
  harness destroy [--target <path>] [--plan] [--confirm] [--json]

Options:
  --target <path>  Target repository root. Defaults to the current dir.
  --plan           Print the teardown plan without writing files.
  --confirm        Permanently remove harness artifacts from the target repo.
  --json           Emit JSON result.
  -h, --help       Show this help.
`);
}

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function loadManifest(root) {
  const path = safeTargetPath(root, ".harness/manifest.yaml");
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

function loadLock(root) {
  const path = safeTargetPath(root, ".harness/lock.yaml");
  if (!existsSync(path)) return null;

  try {
    const lockYaml = readYamlFile(path);
    return lockYaml?.lock ?? null;
  } catch {
    return null;
  }
}

function safeTargetPath(root, relPath) {
  const full = resolve(root, relPath);
  const resolvedRoot = resolve(root);
  if (full !== resolvedRoot && !full.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`${relPath}: path escapes target root`);
  }
  return full;
}

function markerId(path) {
  return path
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function markerStart(path) {
  return `<!-- harness:start ${markerId(path)} -->`;
}

function markerEnd(path) {
  return `<!-- harness:end ${markerId(path)} -->`;
}

function markerPattern(path) {
  const start = markerStart(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = markerEnd(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${start}[\\s\\S]*?${end}`);
}

function gitignoreMarkerPattern() {
  return /# harness:start gitignore[\s\S]*?# harness:end gitignore/;
}

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

function meaningfulContent(content) {
  const withoutFrontmatter = stripFrontmatter(content).trim();
  const meaningfulLines = withoutFrontmatter
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^#+\s*(Agent Instructions|.* Status|.* Context Briefing)$/i.test(line));
  return meaningfulLines.join("\n").trim();
}

function removeMarkedSection(path, content) {
  const pattern = path === ".gitignore" ? gitignoreMarkerPattern() : markerPattern(path);
  if (!pattern.test(content)) return null;

  const cleaned = content
    .replace(pattern, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned ? `${cleaned}\n` : "";
}

function normalizeRelPath(path) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function hasGitPath(path) {
  return path === ".git" || path.startsWith(".git/");
}

function addFile(set, path) {
  const normalized = normalizeRelPath(path);
  if (!normalized || hasGitPath(normalized)) return;
  set.add(normalized);
}

function addDirectory(set, path) {
  const normalized = normalizeRelPath(path);
  if (!normalized || hasGitPath(normalized) || normalized === ".") return;
  set.add(normalized);
}

function artifactPathsFromInstalledModules(root, harness) {
  const files = new Set();
  const directories = new Set();

  for (const moduleRef of harness.modules ?? []) {
    if (!moduleRef?.id) continue;
    const moduleDefinition = `modules/${moduleRef.id}/module.yaml`;
    addFile(files, moduleDefinition);
    addDirectory(directories, `modules/${moduleRef.id}`);

    const modulePath = safeTargetPath(root, moduleDefinition);
    if (!existsSync(modulePath)) continue;

    try {
      const moduleYaml = readYamlFile(modulePath);
      for (const artifact of moduleYaml?.module?.install?.artifacts ?? []) {
        if (!artifact?.path) continue;
        if (artifact.type === "directory") {
          addDirectory(directories, artifact.path);
        } else {
          addFile(files, artifact.path);
        }
      }
    } catch {
      // Doctor reports malformed module definitions. Destroy still removes the
      // module definition path and any manifest/lock-listed artifacts.
    }
  }

  return { files, directories };
}

function lockFileMap(lock) {
  const byPath = new Map();
  for (const file of lock?.files ?? []) {
    if (file?.path) byPath.set(file.path, file);
  }
  return byPath;
}

function isLockedClean(root, relPath, lockFiles) {
  const entry = lockFiles.get(relPath);
  if (!entry?.sha256) return false;
  const fullPath = safeTargetPath(root, relPath);
  if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) return false;
  return sha256(readFileSync(fullPath)) === entry.sha256;
}

function buildDestroyPlan(root) {
  let manifest;
  try {
    manifest = loadManifest(root);
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
  if (manifest.error) return { ok: false, errors: [manifest.error] };

  const lock = loadLock(root);
  const lockFiles = lockFileMap(lock);
  const moduleArtifacts = artifactPathsFromInstalledModules(root, manifest.harness);
  const fileDeletes = new Set(moduleArtifacts.files);
  const directoryDeletes = new Set(moduleArtifacts.directories);
  const edits = [];
  const missing = [];
  const warnings = [];

  for (const file of manifest.harness.managed_files ?? []) {
    if (file?.path) addFile(fileDeletes, file.path);
  }

  for (const file of lock?.files ?? []) {
    if (file?.path) addFile(fileDeletes, file.path);
  }

  addDirectory(directoryDeletes, ".harness");

  for (const relPath of Array.from(fileDeletes)) {
    const fullPath = safeTargetPath(root, relPath);
    if (!existsSync(fullPath)) {
      missing.push(relPath);
      fileDeletes.delete(relPath);
      continue;
    }

    if (statSync(fullPath).isDirectory()) {
      addDirectory(directoryDeletes, relPath);
      fileDeletes.delete(relPath);
      continue;
    }

    const content = readFileSync(fullPath, "utf8");
    const cleaned = removeMarkedSection(relPath, content);
    if (cleaned == null) continue;

    fileDeletes.delete(relPath);
    if (meaningfulContent(cleaned)) {
      edits.push({
        path: relPath,
        action: "remove-harness-section",
        delete_if_empty: false,
        remaining_harness_reference: /\bharness\b/i.test(cleaned),
      });
      if (/\bharness\b/i.test(cleaned)) {
        warnings.push(`${relPath}: remaining content still contains 'harness' outside harness-owned markers`);
      }
    } else {
      edits.push({
        path: relPath,
        action: "delete-after-section-removal",
        delete_if_empty: true,
        remaining_harness_reference: false,
      });
    }
  }

  for (const relPath of [".gitignore"]) {
    const fullPath = safeTargetPath(root, relPath);
    if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) continue;
    if (edits.some((edit) => edit.path === relPath) || fileDeletes.has(relPath)) continue;

    const content = readFileSync(fullPath, "utf8");
    const cleaned = removeMarkedSection(relPath, content);
    if (cleaned == null) continue;

    if (meaningfulContent(cleaned)) {
      edits.push({
        path: relPath,
        action: "remove-harness-section",
        delete_if_empty: false,
        remaining_harness_reference: /\bharness\b/i.test(cleaned),
      });
      if (/\bharness\b/i.test(cleaned)) {
        warnings.push(`${relPath}: remaining content still contains 'harness' outside harness-owned markers`);
      }
    } else {
      edits.push({
        path: relPath,
        action: "delete-after-section-removal",
        delete_if_empty: true,
        remaining_harness_reference: false,
      });
    }
  }

  for (const relPath of Array.from(fileDeletes)) {
    if (edits.some((edit) => edit.path === relPath)) fileDeletes.delete(relPath);
  }

  const cleanDeletes = [];
  const forcedDeletes = [];
  for (const relPath of Array.from(fileDeletes).sort()) {
    if (isLockedClean(root, relPath, lockFiles)) {
      cleanDeletes.push(relPath);
    } else {
      forcedDeletes.push(relPath);
    }
  }

  return {
    ok: true,
    targetRoot: root,
    profile: manifest.harness.profile ?? null,
    git_preserved: true,
    edits: edits.sort((a, b) => a.path.localeCompare(b.path)),
    delete_files: cleanDeletes,
    delete_modified_files: forcedDeletes,
    delete_directories: Array.from(directoryDeletes).sort((a, b) => b.length - a.length || b.localeCompare(a)),
    missing: missing.sort(),
    warnings: [
      ...warnings,
      ...(forcedDeletes.length > 0
        ? [`${forcedDeletes.length} file(s) differ from lock or lack lock entries and will still be deleted with --confirm`]
        : []),
      "Git metadata is not removed; .git is preserved.",
    ],
  };
}

function ensureParent(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function pruneEmptyParents(root, relPath) {
  const parts = normalizeRelPath(relPath).split("/");
  parts.pop();
  while (parts.length > 0) {
    const rel = parts.join("/");
    if (rel === ".harness" || rel === ".git") return;
    const full = safeTargetPath(root, rel);
    if (!existsSync(full) || !statSync(full).isDirectory()) {
      parts.pop();
      continue;
    }
    try {
      rmSync(full, { recursive: false });
    } catch {
      return;
    }
    parts.pop();
  }
}

function applyDestroyPlan(plan) {
  const edited = [];
  const deleted = [];
  const backup = createLifecycleBackup({
    root: plan.targetRoot,
    purpose: "destroy-confirm",
    backupRoot: DESTROY_BACKUP_ROOT,
    paths: [
      ...plan.edits.map((edit) => edit.path),
      ...plan.delete_files,
      ...plan.delete_modified_files,
    ],
    directories: plan.delete_directories,
    metadata: {
      command: "harness destroy --confirm",
      profile: plan.profile,
    },
  });

  for (const edit of plan.edits) {
    const fullPath = safeTargetPath(plan.targetRoot, edit.path);
    if (!existsSync(fullPath)) continue;
    const content = readFileSync(fullPath, "utf8");
    const cleaned = removeMarkedSection(edit.path, content);
    if (cleaned == null) continue;

    if (!meaningfulContent(cleaned)) {
      rmSync(fullPath, { force: true });
      pruneEmptyParents(plan.targetRoot, edit.path);
      deleted.push(edit.path);
      continue;
    }

    ensureParent(fullPath);
    writeFileSync(fullPath, cleaned);
    edited.push(edit.path);
  }

  for (const relPath of [...plan.delete_files, ...plan.delete_modified_files]) {
    const fullPath = safeTargetPath(plan.targetRoot, relPath);
    if (!existsSync(fullPath)) continue;
    rmSync(fullPath, { force: true });
    pruneEmptyParents(plan.targetRoot, relPath);
    deleted.push(relPath);
  }

  for (const relPath of plan.delete_directories) {
    const fullPath = safeTargetPath(plan.targetRoot, relPath);
    if (!existsSync(fullPath) || !statSync(fullPath).isDirectory()) continue;
    rmSync(fullPath, { recursive: true, force: true });
    pruneEmptyParents(plan.targetRoot, relPath);
    deleted.push(`${relPath}/`);
  }

  return { edited, deleted, backup };
}

function printPlan(plan, { confirmed }) {
  console.log(`Harness destroy: ${confirmed ? "confirmed teardown" : "teardown plan"}`);
  console.log(`target: ${plan.targetRoot}`);
  if (plan.profile) console.log(`profile: ${plan.profile}`);
  if (plan.edits.length > 0) {
    console.log("edit:");
    for (const edit of plan.edits) console.log(`  ${edit.path}: ${edit.action}`);
  }
  if (plan.delete_files.length > 0) {
    console.log("delete clean files:");
    for (const file of plan.delete_files) console.log(`  ${file}`);
  }
  if (plan.delete_modified_files.length > 0) {
    console.log("delete modified or unlocked files:");
    for (const file of plan.delete_modified_files) console.log(`  ${file}`);
  }
  if (plan.delete_directories.length > 0) {
    console.log("delete directories:");
    for (const directory of plan.delete_directories) console.log(`  ${directory}/`);
  }
  if (plan.missing.length > 0) {
    console.log("missing:");
    for (const file of plan.missing) console.log(`  ${file}`);
  }
  if (plan.warnings.length > 0) {
    console.log("warnings:");
    for (const warning of plan.warnings) console.log(`  ${warning}`);
  }
  if (confirmed && plan.backup?.created) {
    console.log(`backup: ${plan.backup.path}`);
  }
  if (!confirmed) {
    console.log("");
    console.log("Harness destroy: no files changed; pass --confirm to permanently remove these artifacts");
  }
}

function printJson(result) {
  console.log(JSON.stringify(result, null, 2));
}

export function runDestroy({ cwd = process.cwd(), args = [] } = {}) {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return { ok: true };
  }

  const json = args.includes("--json");
  const confirmed = args.includes("--confirm");
  const targetArg = argValue(args, "--target", cwd);
  const targetRoot = resolve(cwd, targetArg);
  const plan = buildDestroyPlan(targetRoot);

  if (!plan.ok) {
    const result = { ok: false, targetRoot, errors: plan.errors };
    if (json) {
      printJson(result);
    } else {
      for (const error of plan.errors) console.error(`fail ${error}`);
      console.error("");
      console.error("Harness destroy: failed");
    }
    return result;
  }

  if (!confirmed) {
    const result = {
      ...plan,
      ok: true,
      mode: "plan",
      applied: false,
      requires_confirm: true,
    };
    if (json) printJson(result);
    else printPlan(plan, { confirmed: false });
    return result;
  }

  const applied = applyDestroyPlan(plan);
  const result = {
    ...plan,
    ok: true,
    mode: "confirm",
    applied: true,
    edited: applied.edited,
    deleted: applied.deleted,
    backup: applied.backup,
  };
  if (json) {
    printJson(result);
  } else {
    printPlan(result, { confirmed: true });
    console.log("");
    console.log(`Harness destroy: removed ${applied.deleted.length} artifact(s), edited ${applied.edited.length} file(s)`);
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runDestroy({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
