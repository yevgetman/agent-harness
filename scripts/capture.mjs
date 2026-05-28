#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const CAPTURE_DIR = "capture";
const README_PATH = "capture/README.md";
const INBOX_PATH = "capture/inbox.yaml";
const TRIAGE_PATH = "capture/triage.yaml";
const VALID_ITEM_STATUSES = new Set(["open", "triaged", "promoted", "deferred", "closed"]);
const VALID_TRIAGE_STATUSES = new Set(["triaged", "promoted", "deferred", "closed"]);
const VALID_KINDS = new Set(["task", "observation", "idea", "bug", "question", "note"]);
const VALID_PROMOTION_TARGETS = new Set([
  "none",
  "decisions",
  "open-questions",
  "plans",
  "status",
  "canonical-state",
  "durable-memory",
]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function writeYamlFile(path, value) {
  writeFileSync(path, stringifyYaml(value));
}

function loadYamlSection(root, path, key) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    return { ok: false, errors: [`${path}: missing`], warnings: [], value: null };
  }

  try {
    const yaml = readYamlFile(fullPath);
    if (!yaml?.[key]) {
      return { ok: false, errors: [`${path}: missing top-level ${key} key`], warnings: [], value: null };
    }
    return { ok: true, errors: [], warnings: [], value: yaml[key] };
  } catch (parseError) {
    return { ok: false, errors: [`${path}: YAML parse error: ${parseError.message}`], warnings: [], value: null };
  }
}

function loadCapture(root) {
  const inbox = loadYamlSection(root, INBOX_PATH, "capture_inbox");
  const triage = loadYamlSection(root, TRIAGE_PATH, "capture_triage");
  return {
    inbox: inbox.value,
    triage: triage.value,
    errors: [...inbox.errors, ...triage.errors],
    warnings: [...inbox.warnings, ...triage.warnings],
  };
}

function checkMarkdownHeading(root, path, heading, errors) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    errors.push(`${path}: missing`);
    return;
  }

  const text = readFileSync(fullPath, "utf8");
  if (!text.includes(heading)) {
    errors.push(`${path}: missing '${heading}' heading`);
  }
}

function validateItems(items, errors) {
  if (!Array.isArray(items)) {
    errors.push(`${INBOX_PATH}: capture_inbox.items must be a list`);
    return new Set();
  }

  const ids = new Set();
  for (const item of items) {
    const id = item?.id ?? "unknown";
    if (!item?.id) {
      errors.push(`${INBOX_PATH}: item missing id`);
      continue;
    }

    if (!/^[a-z0-9-]+$/.test(item.id)) {
      errors.push(`${INBOX_PATH}: item '${item.id}' id must be kebab-case`);
    }

    if (ids.has(item.id)) {
      errors.push(`${INBOX_PATH}: duplicate item id '${item.id}'`);
    }
    ids.add(item.id);

    if (!item.title) {
      errors.push(`${INBOX_PATH}: item '${id}' missing title`);
    }

    if (!item.summary) {
      errors.push(`${INBOX_PATH}: item '${id}' missing summary`);
    }

    if (!VALID_KINDS.has(item.kind)) {
      errors.push(`${INBOX_PATH}: item '${id}' has invalid kind '${item.kind}'`);
    }

    if (!VALID_ITEM_STATUSES.has(item.status)) {
      errors.push(`${INBOX_PATH}: item '${id}' has invalid status '${item.status}'`);
    }

    if (item.promote_to && !VALID_PROMOTION_TARGETS.has(item.promote_to)) {
      errors.push(`${INBOX_PATH}: item '${id}' has invalid promote_to '${item.promote_to}'`);
    }

    if (item.tags && !Array.isArray(item.tags)) {
      errors.push(`${INBOX_PATH}: item '${id}' tags must be a list`);
    }

    if (item.references && !Array.isArray(item.references)) {
      errors.push(`${INBOX_PATH}: item '${id}' references must be a list`);
    }
  }

  return ids;
}

function validateRecords(records, itemIds, errors) {
  if (!Array.isArray(records)) {
    errors.push(`${TRIAGE_PATH}: capture_triage.records must be a list`);
    return;
  }

  const ids = new Set();
  for (const record of records) {
    const id = record?.id ?? "unknown";
    if (!record?.id) {
      errors.push(`${TRIAGE_PATH}: record missing id`);
      continue;
    }

    if (!/^[a-z0-9-]+$/.test(record.id)) {
      errors.push(`${TRIAGE_PATH}: record '${record.id}' id must be kebab-case`);
    }

    if (ids.has(record.id)) {
      errors.push(`${TRIAGE_PATH}: duplicate record id '${record.id}'`);
    }
    ids.add(record.id);

    if (!record.item_id) {
      errors.push(`${TRIAGE_PATH}: record '${id}' missing item_id`);
    } else if (!itemIds.has(record.item_id)) {
      errors.push(`${TRIAGE_PATH}: record '${id}' item_id '${record.item_id}' is not in capture inbox`);
    }

    if (!VALID_TRIAGE_STATUSES.has(record.status)) {
      errors.push(`${TRIAGE_PATH}: record '${id}' has invalid status '${record.status}'`);
    }

    if (record.promote_to && !VALID_PROMOTION_TARGETS.has(record.promote_to)) {
      errors.push(`${TRIAGE_PATH}: record '${id}' has invalid promote_to '${record.promote_to}'`);
    }

    if (record.status === "promoted" && (!record.promote_to || record.promote_to === "none")) {
      errors.push(`${TRIAGE_PATH}: record '${id}' with promoted status must include a promotion target`);
    }
  }
}

export function validateCapture(root) {
  const loaded = loadCapture(root);
  const errors = [...loaded.errors];
  const warnings = [...loaded.warnings];
  const inbox = loaded.inbox;
  const triage = loaded.triage;

  if (!existsSync(join(root, CAPTURE_DIR))) {
    errors.push(`${CAPTURE_DIR}/: missing`);
  }
  checkMarkdownHeading(root, README_PATH, "# Capture And Triage", errors);

  const items = Array.isArray(inbox?.items) ? inbox.items : [];
  const records = Array.isArray(triage?.records) ? triage.records : [];

  if (inbox) {
    if (inbox.version !== 1) {
      errors.push(`${INBOX_PATH}: capture_inbox.version must be 1`);
    }
    const itemIds = validateItems(inbox.items, errors);
    if (triage) {
      validateRecords(triage.records, itemIds, errors);
    }
  }

  if (triage && triage.version !== 1) {
    errors.push(`${TRIAGE_PATH}: capture_triage.version must be 1`);
  }

  return {
    ok: errors.length === 0,
    root,
    errors,
    warnings,
    inbox,
    triage,
    items,
    records,
  };
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

function printHelp() {
  console.log(`harness capture

Usage:
  harness capture list [--target <path>] [--status <status>] [--kind <kind>] [--promote-to <target>] [--tag <tag>] [--json]
  harness capture add "<title>" [--target <path>] [--summary <summary>] [--kind <kind>] [--source <source>] [--promote-to <target>] [--tag <tag>] [--json]
  harness capture triage --id <item-id> --status <status> [--target <path>] [--promote-to <target>] [--note <text>] [--json]
  harness capture check [--target <path>] [--json]
  harness capture report [--target <path>] [--json]

Commands:
  list     List captured inbox items.
  add      Add an inbox item.
  triage   Record triage state and promotion target for an inbox item.
  check    Validate capture and triage files.
  report   Summarize captured and triaged items.
`);
}

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function repeatedArg(args, flag) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && i + 1 < args.length) {
      values.push(args[i + 1]);
      i += 1;
    }
  }
  return values;
}

function positionalArgs(args) {
  const valueFlags = new Set([
    "--target",
    "--title",
    "--summary",
    "--kind",
    "--source",
    "--status",
    "--promote-to",
    "--tag",
    "--id",
    "--note",
  ]);
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (valueFlags.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) continue;
    values.push(arg);
  }
  return values;
}

function filtersFromArgs(args) {
  return {
    status: argValue(args, "--status"),
    kind: argValue(args, "--kind"),
    promote_to: argValue(args, "--promote-to"),
    tag: argValue(args, "--tag"),
  };
}

function filterItems(items, filters) {
  return items.filter((item) => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.kind && item.kind !== filters.kind) return false;
    if (filters.promote_to && item.promote_to !== filters.promote_to) return false;
    if (filters.tag && !(item.tags ?? []).includes(filters.tag)) return false;
    return true;
  });
}

function summarizeCapture(root, items, records) {
  const byStatus = {};
  const byKind = {};
  const byPromotionTarget = {};
  const recordsByStatus = {};
  const recordsByPromotionTarget = {};

  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    const promoteTo = item.promote_to ?? "none";
    byPromotionTarget[promoteTo] = (byPromotionTarget[promoteTo] ?? 0) + 1;
  }

  for (const record of records) {
    recordsByStatus[record.status] = (recordsByStatus[record.status] ?? 0) + 1;
    const promoteTo = record.promote_to ?? "none";
    recordsByPromotionTarget[promoteTo] = (recordsByPromotionTarget[promoteTo] ?? 0) + 1;
  }

  const sortObject = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return {
    total_items: items.length,
    total_records: records.length,
    by_status: sortObject(byStatus),
    by_kind: sortObject(byKind),
    by_promotion_target: sortObject(byPromotionTarget),
    records_by_status: sortObject(recordsByStatus),
    records_by_promotion_target: sortObject(recordsByPromotionTarget),
    files: {
      readme: existsSync(join(root, README_PATH)),
      inbox: existsSync(join(root, INBOX_PATH)),
      triage: existsSync(join(root, TRIAGE_PATH)),
    },
  };
}

function printSummary(summary) {
  console.log(`total_items: ${summary.total_items}`);
  console.log(`total_records: ${summary.total_records}`);
  for (const [label, value] of [
    ["by_status", summary.by_status],
    ["by_kind", summary.by_kind],
    ["by_promotion_target", summary.by_promotion_target],
    ["records_by_status", summary.records_by_status],
    ["records_by_promotion_target", summary.records_by_promotion_target],
  ]) {
    console.log(`${label}:`);
    for (const [key, count] of Object.entries(value)) {
      console.log(`  ${key}: ${count}`);
    }
  }
  console.log("files:");
  for (const [file, present] of Object.entries(summary.files)) {
    console.log(`  ${file}: ${present ? "present" : "missing"}`);
  }
}

function failure(root, args, errors) {
  const result = { ok: false, root, errors, warnings: [] };
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const error of errors) console.error(`fail ${error}`);
  }
  return result;
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || `capture-${todayIso()}`;
}

function nextId(title, items) {
  const base = slugify(title);
  const ids = new Set(items.map((item) => item.id));
  if (!ids.has(base)) return base;
  for (let i = 2; ; i += 1) {
    const candidate = `${base}-${i}`;
    if (!ids.has(candidate)) return candidate;
  }
}

function mutableCapture(root, args) {
  const loaded = loadCapture(root);
  if (loaded.errors.length > 0) {
    return { ok: false, errors: loaded.errors };
  }
  if (!Array.isArray(loaded.inbox?.items)) {
    return { ok: false, errors: [`${INBOX_PATH}: capture_inbox.items must be a list`] };
  }
  if (!Array.isArray(loaded.triage?.records)) {
    return { ok: false, errors: [`${TRIAGE_PATH}: capture_triage.records must be a list`] };
  }
  return { ok: true, ...loaded, args };
}

function writeInbox(root, inbox) {
  mkdirSync(join(root, CAPTURE_DIR), { recursive: true });
  writeYamlFile(join(root, INBOX_PATH), { capture_inbox: inbox });
}

function writeTriage(root, triage) {
  mkdirSync(join(root, CAPTURE_DIR), { recursive: true });
  writeYamlFile(join(root, TRIAGE_PATH), { capture_triage: triage });
}

function runList(root, args) {
  const result = validateCapture(root);
  const filters = filtersFromArgs(args);
  const items = filterItems(result.items, filters);
  const output = { ...result, filters, items };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  if (result.errors.length > 0) printItems("errors", result.errors);
  console.log("Harness capture inbox");
  console.log(`target: ${root}`);
  for (const item of items) {
    console.log(`${item.id} ${item.status} ${item.kind} ${item.promote_to ?? "none"} ${item.title}`);
  }
  return output;
}

function runAdd(root, args) {
  const title = argValue(args, "--title") ?? positionalArgs(args)[0];
  if (!title) {
    return failure(root, args, ["capture add requires a title"]);
  }

  const capture = mutableCapture(root, args);
  if (!capture.ok) return failure(root, args, capture.errors);

  const kind = argValue(args, "--kind", "note");
  if (!VALID_KINDS.has(kind)) {
    return failure(root, args, [`invalid kind '${kind}'`]);
  }

  const promoteTo = argValue(args, "--promote-to", "none");
  if (!VALID_PROMOTION_TARGETS.has(promoteTo)) {
    return failure(root, args, [`invalid promote_to '${promoteTo}'`]);
  }

  const item = {
    id: nextId(title, capture.inbox.items),
    title,
    status: "open",
    kind,
    summary: argValue(args, "--summary", title),
    source: argValue(args, "--source", "operator"),
    created: todayIso(),
    promote_to: promoteTo,
    tags: repeatedArg(args, "--tag"),
    references: [],
  };

  capture.inbox.updated = todayIso();
  capture.inbox.items.push(item);
  writeInbox(root, capture.inbox);

  const result = validateCapture(root);
  const output = { ...result, item };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness capture add");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  console.log(`item: ${item.id}`);
  printItems("errors", result.errors);
  return output;
}

function runTriage(root, args) {
  const itemId = argValue(args, "--id") ?? positionalArgs(args)[0];
  if (!itemId) return failure(root, args, ["capture triage requires --id <item-id>"]);

  const capture = mutableCapture(root, args);
  if (!capture.ok) return failure(root, args, capture.errors);

  const item = capture.inbox.items.find((candidate) => candidate.id === itemId);
  if (!item) return failure(root, args, [`capture item '${itemId}' not found`]);

  const status = argValue(args, "--status", "triaged");
  if (!VALID_TRIAGE_STATUSES.has(status)) {
    return failure(root, args, [`invalid triage status '${status}'`]);
  }

  const promoteTo = argValue(args, "--promote-to", item.promote_to ?? "none");
  if (!VALID_PROMOTION_TARGETS.has(promoteTo)) {
    return failure(root, args, [`invalid promote_to '${promoteTo}'`]);
  }
  if (status === "promoted" && promoteTo === "none") {
    return failure(root, args, ["promoted triage records require --promote-to"]);
  }

  item.status = status;
  item.promote_to = promoteTo;
  capture.inbox.updated = todayIso();

  const record = {
    id: `triage-${itemId}`,
    item_id: itemId,
    status,
    promote_to: promoteTo,
    note: argValue(args, "--note", "Recorded triage state."),
    updated: todayIso(),
  };
  const recordIndex = capture.triage.records.findIndex((candidate) => candidate.id === record.id);
  if (recordIndex >= 0) {
    capture.triage.records[recordIndex] = record;
  } else {
    capture.triage.records.push(record);
  }
  capture.triage.updated = todayIso();

  writeInbox(root, capture.inbox);
  writeTriage(root, capture.triage);

  const result = validateCapture(root);
  const output = { ...result, item, record };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness capture triage");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  console.log(`record: ${record.id}`);
  printItems("errors", result.errors);
  return output;
}

function runCheck(root, args) {
  const result = validateCapture(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log("Harness capture check");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return result;
}

function runReport(root, args) {
  const result = validateCapture(root);
  const summary = summarizeCapture(root, result.items, result.records);
  const output = { ...result, summary };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness capture report");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printSummary(summary);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return output;
}

export function runCapture({ cwd = process.cwd(), args = [] } = {}) {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return { ok: true };
  }

  const targetArg = argValue(rest, "--target", cwd);
  const root = resolve(cwd, targetArg);

  if (subcommand === "list") return runList(root, rest);
  if (subcommand === "add") return runAdd(root, rest);
  if (subcommand === "triage") return runTriage(root, rest);
  if (subcommand === "check") return runCheck(root, rest);
  if (subcommand === "report") return runReport(root, rest);

  console.error(`fail unknown capture command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runCapture({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
