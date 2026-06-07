import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { DEFAULT_BACKUP_ROOT, DESTROY_BACKUP_ROOT } from "./lifecycle-backup.mjs";
import { sha256 } from "./lock.mjs";

const BACKUP_ROOTS = [DEFAULT_BACKUP_ROOT, DESTROY_BACKUP_ROOT];

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function normalizeRelPath(path) {
  return String(path ?? "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function toRel(root, fullPath) {
  return normalizeRelPath(relative(resolve(root), fullPath));
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

function printHelp() {
  console.log(`harness rollback

Usage:
  harness rollback
  harness rollback --plan
  harness rollback --plan --backup <backup-path-or-id>
  harness rollback --plan --json

Options:
  --target <path>       Target repository root. Defaults to the current dir.
  --backup <path-or-id> Backup directory, backup.yaml path, or backup id.
  --json                Emit machine-readable JSON.
  -h, --help            Show this help.

Rollback is currently plan-only. It does not restore files.
`);
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

function readBackupYaml(root, manifestRel) {
  const manifestPath = safeTargetPath(root, manifestRel);
  if (!existsSync(manifestPath)) {
    return { error: `${manifestRel}: missing backup manifest` };
  }

  try {
    const parsed = parseYaml(readFileSync(manifestPath, "utf8"));
    const backup = parsed?.backup;
    if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
      return { error: `${manifestRel}: missing top-level backup key` };
    }
    if (backup.version !== 1) {
      return { error: `${manifestRel}: unsupported backup version '${backup.version ?? "unknown"}'` };
    }
    if (!Array.isArray(backup.files)) {
      return { error: `${manifestRel}: backup.files must be a list` };
    }
    return { backup };
  } catch (error) {
    return { error: `${manifestRel}: YAML parse error: ${error.message}` };
  }
}

function backupManifestCandidates(root, backupArg) {
  const candidates = [];

  if (isAbsolute(backupArg)) {
    const full = resolve(backupArg);
    const resolvedRoot = resolve(root);
    if (full !== resolvedRoot && !full.startsWith(`${resolvedRoot}${sep}`)) {
      return { error: `${backupArg}: backup path escapes target root` };
    }
    const rel = toRel(root, full);
    candidates.push(rel.endsWith("backup.yaml") ? rel : normalizeRelPath(`${rel}/backup.yaml`));
    return { candidates };
  }

  const normalized = normalizeRelPath(backupArg);
  if (!normalized) return { candidates };
  candidates.push(normalized.endsWith("backup.yaml") ? normalized : normalizeRelPath(`${normalized}/backup.yaml`));
  for (const rootPath of BACKUP_ROOTS) {
    candidates.push(normalizeRelPath(`${rootPath}/${normalized}/backup.yaml`));
  }
  return { candidates: Array.from(new Set(candidates)) };
}

function resolveRequestedBackupManifest(root, backupArg) {
  const candidates = backupManifestCandidates(root, backupArg);
  if (candidates.error) return { error: candidates.error };

  for (const candidate of candidates.candidates) {
    if (existsSync(safeTargetPath(root, candidate))) return { manifest: candidate };
  }

  return {
    error: `${backupArg}: backup manifest not found`,
    candidates: candidates.candidates,
  };
}

function listBackupManifests(root) {
  const manifests = [];
  for (const backupRoot of BACKUP_ROOTS) {
    const fullRoot = safeTargetPath(root, backupRoot);
    if (!existsSync(fullRoot) || !statSync(fullRoot).isDirectory()) continue;

    for (const entry of readdirSync(fullRoot).sort()) {
      const rel = normalizeRelPath(`${backupRoot}/${entry}/backup.yaml`);
      const full = safeTargetPath(root, rel);
      if (existsSync(full)) manifests.push(rel);
    }
  }
  return manifests;
}

function latestBackupManifest(root) {
  const manifests = listBackupManifests(root);
  if (manifests.length === 0) return { error: "no lifecycle backup manifests found" };

  const loaded = manifests.map((manifest) => {
    const read = readBackupYaml(root, manifest);
    return {
      manifest,
      error: read.error ?? null,
      createdAt: Date.parse(read.backup?.created_at ?? ""),
    };
  });

  const valid = loaded
    .filter((item) => !item.error && Number.isFinite(item.createdAt))
    .sort((a, b) => b.createdAt - a.createdAt || b.manifest.localeCompare(a.manifest));
  if (valid.length > 0) return { manifest: valid[0].manifest };

  return { manifest: loaded[0].manifest };
}

function backupSummary({ manifestRel, backup }) {
  const backupPath = normalizeRelPath(dirname(manifestRel));
  return {
    path: backupPath,
    manifest: manifestRel,
    backup_root: BACKUP_ROOTS.find((root) => backupPath === root || backupPath.startsWith(`${root}/`)) ?? null,
    purpose: backup.purpose ?? "unknown",
    created_at: backup.created_at ?? null,
    source_target: backup.target ?? null,
    files: backup.files.length,
    missing: backup.missing ?? [],
    skipped: backup.skipped ?? [],
    metadata: backup.metadata ?? {},
  };
}

export function buildRollbackPlan({ root, backupArg = null } = {}) {
  const target = resolve(root ?? process.cwd());
  const selected = backupArg
    ? resolveRequestedBackupManifest(target, backupArg)
    : latestBackupManifest(target);

  if (selected.error) {
    return {
      ok: false,
      target,
      mode: "plan",
      applied: false,
      status: "blocked",
      backup: null,
      operation_summary: summarizeOperations([]),
      operations: [],
      actions: [],
      warnings: [],
      blockers: [selected.error],
      notes: ["rollback is plan-only; no files changed"],
      errors: [selected.error],
      ...(selected.candidates ? { candidates: selected.candidates } : {}),
    };
  }

  const manifestRel = selected.manifest;
  const loaded = readBackupYaml(target, manifestRel);
  if (loaded.error) {
    return {
      ok: false,
      target,
      mode: "plan",
      applied: false,
      status: "blocked",
      backup: {
        manifest: manifestRel,
        path: normalizeRelPath(dirname(manifestRel)),
      },
      operation_summary: summarizeOperations([]),
      operations: [],
      actions: [],
      warnings: [],
      blockers: [loaded.error],
      notes: ["rollback is plan-only; no files changed"],
      errors: [loaded.error],
    };
  }

  const backup = loaded.backup;
  const operations = [];
  const actions = [];
  const warnings = [];
  const blockers = [];
  const notes = ["rollback is plan-only; no files changed"];

  for (const file of backup.files) {
    const path = normalizeRelPath(file.path);
    const backupPath = normalizeRelPath(file.backup_path);
    if (!path || !backupPath || !file.sha256) {
      const subject = path || backupPath || "unknown";
      addOperation(operations, {
        code: "blocked/invalid-backup-file-record",
        subject_type: "file",
        subject,
        detail: "backup file record is missing path, backup_path, or sha256",
      });
      blockers.push(`${subject}: backup file record is invalid`);
      continue;
    }

    const backupFullPath = safeTargetPath(target, backupPath);
    if (!existsSync(backupFullPath)) {
      addOperation(operations, {
        code: "blocked/missing-backup-file",
        subject_type: "file",
        subject: path,
        detail: "backup copy is missing",
        restore: {
          path,
          backup_path: backupPath,
          sha256: file.sha256,
        },
      });
      blockers.push(`${path}: backup copy is missing`);
      continue;
    }

    const backupSha = sha256(readFileSync(backupFullPath));
    if (backupSha !== file.sha256) {
      addOperation(operations, {
        code: "blocked/corrupt-backup-file",
        subject_type: "file",
        subject: path,
        detail: "backup copy fingerprint differs from the backup manifest",
        restore: {
          path,
          backup_path: backupPath,
          expected_sha256: file.sha256,
          actual_sha256: backupSha,
        },
      });
      blockers.push(`${path}: backup copy fingerprint mismatch`);
      continue;
    }

    const targetPath = safeTargetPath(target, path);
    if (!existsSync(targetPath)) {
      addOperation(operations, {
        code: "safe/restore-missing-file",
        subject_type: "file",
        subject: path,
        detail: "target file is missing and can be restored from the backup copy",
        restore: {
          action: "create",
          path,
          backup_path: backupPath,
          sha256: file.sha256,
        },
      });
      actions.push(`restore missing file: ${path}`);
      continue;
    }

    const currentSha = sha256(readFileSync(targetPath));
    if (currentSha === file.sha256) {
      addOperation(operations, {
        code: "safe/rollback-noop",
        subject_type: "file",
        subject: path,
        detail: "target file already matches the backup copy",
        restore: {
          action: "noop",
          path,
          backup_path: backupPath,
          sha256: file.sha256,
        },
      });
      continue;
    }

    addOperation(operations, {
      code: "review/restore-overwrite-current-file",
      subject_type: "file",
      subject: path,
      detail: "target file exists and differs from the backup copy; restoring would overwrite current content",
      restore: {
        action: "replace",
        path,
        backup_path: backupPath,
        backup_sha256: file.sha256,
        current_sha256: currentSha,
      },
    });
    warnings.push(`${path}: restore would overwrite current content`);
  }

  const missing = Array.isArray(backup.missing) ? backup.missing : [];
  const skipped = Array.isArray(backup.skipped) ? backup.skipped : [];
  if (missing.length > 0) notes.push(`${missing.length} path(s) were missing at backup time`);
  if (skipped.length > 0) notes.push(`${skipped.length} path(s) were skipped at backup time`);

  const hasBlockers = operations.some((operation) => operation.status === "blocked");
  const hasReviews = operations.some((operation) => operation.status === "review");
  const hasRestores = operations.some((operation) => operation.code === "safe/restore-missing-file");
  const status = hasBlockers ? "blocked" : hasReviews ? "review-required" : hasRestores ? "ready" : "noop";

  return {
    ok: true,
    target,
    mode: "plan",
    applied: false,
    status,
    backup: backupSummary({ manifestRel, backup }),
    operation_summary: summarizeOperations(operations),
    operations,
    actions,
    warnings,
    blockers,
    notes,
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

function printOperations(operations) {
  console.log("operations:");
  if (operations.length === 0) {
    console.log("  none");
    return;
  }
  for (const operation of operations) {
    console.log(`  ${operation.code}: ${operation.subject_type} ${operation.subject}`);
    console.log(`    ${operation.detail}`);
  }
}

function printPlan(plan) {
  console.log("Harness rollback plan");
  console.log(`target: ${plan.target}`);
  console.log(`status: ${plan.status}`);
  if (plan.backup) {
    console.log(`backup: ${plan.backup.path}`);
    console.log(`manifest: ${plan.backup.manifest}`);
    console.log(`purpose: ${plan.backup.purpose}`);
    if (plan.backup.created_at) console.log(`created_at: ${plan.backup.created_at}`);
  }
  printOperations(plan.operations);
  printList("actions", plan.actions);
  printList("warnings", plan.warnings);
  printList("blockers", plan.blockers);
  printList("notes", plan.notes);
}

export function runRollback({ cwd = process.cwd(), args = [] } = {}) {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return { ok: true };
  }

  const unsupported = args.find((arg) => ["apply", "--apply", "--confirm", "restore"].includes(arg));
  const json = args.includes("--json");
  const target = resolve(argValue(args, "--target", cwd));
  const backupArg = argValue(args, "--backup", null);
  const wantsPlan = args.length === 0 || args.includes("--plan") || args.includes("plan");

  if (unsupported || !wantsPlan) {
    const result = {
      ok: false,
      target,
      errors: [
        unsupported
          ? `rollback '${unsupported}' is not implemented; use harness rollback --plan`
          : "rollback is currently plan-only; use harness rollback --plan",
      ],
    };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const error of result.errors) console.error(`fail ${error}`);
    }
    return result;
  }

  const plan = buildRollbackPlan({ root: target, backupArg });
  if (json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    printPlan(plan);
  }
  return plan;
}
