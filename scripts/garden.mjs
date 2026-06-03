#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { expectedLockPaths, hashFile, lockFileMap, readLock } from "./lock.mjs";

const GARDENING_DIR = "gardening";
const README_PATH = "gardening/README.md";
const RULES_PATH = "gardening/rules.yaml";
const SNAPSHOTS_PATH = "gardening/snapshots.md";
const VALID_STATUSES = new Set(["active", "planned", "deprecated", "archived"]);
const VALID_KINDS = new Set([
  "stale-artifact",
  "status-hygiene",
  "capture-hygiene",
  "memory-hygiene",
  "plan-hygiene",
  "lock-hygiene",
  "report-hygiene",
  "custom",
]);
const VALID_SEVERITIES = new Set(["info", "low", "medium", "high", "critical"]);

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function readYamlIfPresent(root, path) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) return null;
  try {
    return readYamlFile(fullPath);
  } catch {
    return null;
  }
}

function loadGardening(root) {
  const path = join(root, RULES_PATH);
  if (!existsSync(path)) {
    return { ok: false, errors: [`${RULES_PATH}: missing`], warnings: [], gardening: null, rules: [] };
  }

  try {
    const yaml = readYamlFile(path);
    const gardening = yaml?.gardening;
    if (!gardening) {
      return {
        ok: false,
        errors: [`${RULES_PATH}: missing top-level gardening key`],
        warnings: [],
        gardening: null,
        rules: [],
      };
    }

    return {
      ok: true,
      errors: [],
      warnings: [],
      gardening,
      rules: gardening.rules ?? [],
    };
  } catch (parseError) {
    return {
      ok: false,
      errors: [`${RULES_PATH}: YAML parse error: ${parseError.message}`],
      warnings: [],
      gardening: null,
      rules: [],
    };
  }
}

function checkMarkdownHeading(root, path, heading, errors) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    errors.push(`${path}: missing`);
    return false;
  }

  const text = readFileSync(fullPath, "utf8");
  if (!text.includes(heading)) {
    errors.push(`${path}: missing '${heading}' heading`);
    return false;
  }
  return true;
}

function isLocalReference(reference) {
  return !reference.includes("://")
    && !reference.startsWith("/")
    && !reference.startsWith("~")
    && !reference.startsWith("command:")
    && !reference.startsWith("external:")
    && !reference.includes("*");
}

export function validateGardening(root) {
  const loaded = loadGardening(root);
  const errors = [...loaded.errors];
  const warnings = [...loaded.warnings];
  const gardening = loaded.gardening;
  const rules = Array.isArray(loaded.rules) ? loaded.rules : [];

  if (!existsSync(join(root, GARDENING_DIR))) {
    errors.push(`${GARDENING_DIR}/: missing`);
  }

  checkMarkdownHeading(root, README_PATH, "# Gardening And Entropy Management", errors);
  checkMarkdownHeading(root, SNAPSHOTS_PATH, "# Gardening Snapshots", errors);

  if (!loaded.ok) {
    return { ok: false, root, errors, warnings, rules: [] };
  }

  if (gardening.version !== 1) {
    errors.push(`${RULES_PATH}: gardening.version must be 1`);
  }

  if (!Array.isArray(gardening.rules)) {
    errors.push(`${RULES_PATH}: gardening.rules must be a list`);
    return { ok: false, root, errors, warnings, rules: [] };
  }

  const ids = new Set();
  for (const rule of rules) {
    const id = rule?.id ?? "unknown";
    if (!rule?.id) {
      errors.push(`${RULES_PATH}: rule missing id`);
      continue;
    }

    if (!/^[a-z0-9-]+$/.test(rule.id)) {
      errors.push(`${RULES_PATH}: rule '${rule.id}' id must be kebab-case`);
    }

    if (ids.has(rule.id)) {
      errors.push(`${RULES_PATH}: duplicate rule id '${rule.id}'`);
    }
    ids.add(rule.id);

    if (!rule.title) errors.push(`${RULES_PATH}: rule '${id}' missing title`);
    if (!VALID_KINDS.has(rule.kind)) errors.push(`${RULES_PATH}: rule '${id}' has invalid kind '${rule.kind}'`);
    if (!VALID_STATUSES.has(rule.status)) errors.push(`${RULES_PATH}: rule '${id}' has invalid status '${rule.status}'`);
    if (!VALID_SEVERITIES.has(rule.severity)) {
      errors.push(`${RULES_PATH}: rule '${id}' has invalid severity '${rule.severity}'`);
    }
    if (!rule.summary) errors.push(`${RULES_PATH}: rule '${id}' missing summary`);
    if (rule.sources && !Array.isArray(rule.sources)) errors.push(`${RULES_PATH}: rule '${id}' sources must be a list`);
    if (rule.tags && !Array.isArray(rule.tags)) errors.push(`${RULES_PATH}: rule '${id}' tags must be a list`);

    const sources = Array.isArray(rule.sources) ? rule.sources : [];
    for (const source of sources) {
      if (typeof source !== "string" || source.trim() === "") {
        errors.push(`${RULES_PATH}: rule '${id}' sources must be non-empty strings`);
        continue;
      }
      if (isLocalReference(source) && !existsSync(join(root, source))) {
        warnings.push(`${RULES_PATH}: rule '${id}' source '${source}' is missing`);
      }
    }

    const tags = Array.isArray(rule.tags) ? rule.tags : [];
    for (const tag of tags) {
      if (typeof tag !== "string" || tag.trim() === "") {
        errors.push(`${RULES_PATH}: rule '${id}' tags must be non-empty strings`);
      }
    }
  }

  return { ok: errors.length === 0, root, errors, warnings, rules };
}

function finding({ id, title, kind, status = "clean", severity = "info", detail }) {
  return { id, title, kind, status, severity, detail };
}

function lineCount(root, path) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) return null;
  const text = readFileSync(fullPath, "utf8");
  return text.split(/\r?\n/).length;
}

function addLockHealthFindings(root, findings) {
  const manifest = readYamlIfPresent(root, ".harness/manifest.yaml")?.harness;
  if (!manifest) {
    findings.push(finding({
      id: "lock-health-manifest-missing",
      title: "Lock health manifest missing",
      kind: "lock-hygiene",
      status: "warning",
      severity: "high",
      detail: ".harness/manifest.yaml is missing; lock hygiene cannot be inspected",
    }));
    return;
  }

  const loaded = readLock(root);
  if (loaded.status === "missing" || loaded.status === "invalid") {
    findings.push(finding({
      id: "lock-health-unavailable",
      title: "Lock health unavailable",
      kind: "lock-hygiene",
      status: "warning",
      severity: "high",
      detail: loaded.status === "missing" ? ".harness/lock.yaml is missing" : loaded.error,
    }));
    return;
  }

  const locked = lockFileMap(loaded.lock);
  let missing = 0;
  let changed = 0;
  for (const expectedPath of expectedLockPaths(manifest, { root })) {
    const entry = locked.get(expectedPath);
    if (!entry) {
      missing += 1;
      continue;
    }
    if (existsSync(join(root, expectedPath)) && hashFile(root, expectedPath) !== entry.sha256) {
      changed += 1;
    }
  }

  findings.push(finding({
    id: "lock-health",
    title: "Lock health",
    kind: "lock-hygiene",
    status: missing === 0 && changed === 0 ? "clean" : "recommendation",
    severity: missing === 0 && changed === 0 ? "info" : "medium",
    detail: missing === 0 && changed === 0
      ? "lock entries match installed files"
      : `${missing} missing lock entr${missing === 1 ? "y" : "ies"} and ${changed} changed fingerprint(s) should be reconciled`,
  }));
}

function addCaptureFindings(root, findings) {
  const inbox = readYamlIfPresent(root, "capture/inbox.yaml")?.capture_inbox;
  const items = Array.isArray(inbox?.items) ? inbox.items : [];
  const openItems = items.filter((item) => item.status === "open");
  findings.push(finding({
    id: "capture-open-items",
    title: "Open capture items",
    kind: "capture-hygiene",
    status: openItems.length > 0 ? "recommendation" : "clean",
    severity: openItems.length > 3 ? "medium" : openItems.length > 0 ? "low" : "info",
    detail: openItems.length > 0
      ? `${openItems.length} open capture item(s) should be triaged or promoted`
      : "no open capture items",
  }));
}

function addPlanFindings(root, findings) {
  const plansStatus = readYamlIfPresent(root, "plans/current.yaml")?.plans_status;
  const plans = Array.isArray(plansStatus?.plans) ? plansStatus.plans : [];
  const completed = plans.filter((plan) => plan.status === "complete").length;
  const deferred = plans.filter((plan) => plan.status === "deferred").length;
  const blocked = plans.filter((plan) => plan.status === "blocked").length;

  findings.push(finding({
    id: "completed-plan-volume",
    title: "Completed plan volume",
    kind: "plan-hygiene",
    status: completed > 25 ? "recommendation" : "clean",
    severity: completed > 40 ? "medium" : completed > 25 ? "low" : "info",
    detail: completed > 25
      ? `${completed} completed plan(s) may need compression or archive review`
      : `${completed} completed plan(s)`,
  }));

  findings.push(finding({
    id: "deferred-and-blocked-plan-volume",
    title: "Deferred and blocked plan volume",
    kind: "plan-hygiene",
    status: blocked > 0 ? "warning" : deferred > 8 ? "recommendation" : "clean",
    severity: blocked > 0 ? "high" : deferred > 8 ? "low" : "info",
    detail: `${deferred} deferred and ${blocked} blocked plan(s)`,
  }));
}

function addStatusFindings(root, findings) {
  const lines = lineCount(root, "status.md");
  if (lines == null) {
    findings.push(finding({
      id: "status-projection-missing",
      title: "Status projection missing",
      kind: "status-hygiene",
      status: "warning",
      severity: "high",
      detail: "status.md is missing",
    }));
    return;
  }

  findings.push(finding({
    id: "status-projection-size",
    title: "Status projection size",
    kind: "status-hygiene",
    status: lines > 900 ? "warning" : lines > 650 ? "recommendation" : "clean",
    severity: lines > 900 ? "medium" : lines > 650 ? "low" : "info",
    detail: `status.md has ${lines} line(s)`,
  }));
}

function addMemoryFindings(root, findings) {
  const lines = lineCount(root, "memory/session-summaries.md");
  if (lines == null) return;
  findings.push(finding({
    id: "session-summary-size",
    title: "Session summary size",
    kind: "memory-hygiene",
    status: lines > 120 ? "recommendation" : "clean",
    severity: lines > 200 ? "medium" : lines > 120 ? "low" : "info",
    detail: `memory/session-summaries.md has ${lines} line(s)`,
  }));
}

function addSnapshotFindings(root, findings) {
  const snapshotPaths = [
    "reports/snapshots.md",
    "reconciliation/snapshots.md",
    "gardening/snapshots.md",
  ];
  for (const path of snapshotPaths) {
    const lines = lineCount(root, path);
    if (lines == null) continue;
    findings.push(finding({
      id: `snapshot-size-${path.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "")}`,
      title: `Snapshot size ${path}`,
      kind: "stale-artifact",
      status: lines > 120 ? "recommendation" : "clean",
      severity: lines > 200 ? "medium" : lines > 120 ? "low" : "info",
      detail: `${path} has ${lines} line(s)`,
    }));
  }
}

function summarizeFindings(findings) {
  const byStatus = {};
  const byKind = {};
  const bySeverity = {};
  for (const item of findings) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    bySeverity[item.severity] = (bySeverity[item.severity] ?? 0) + 1;
  }
  const sortObject = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return {
    total: findings.length,
    by_status: sortObject(byStatus),
    by_kind: sortObject(byKind),
    by_severity: sortObject(bySeverity),
    attention: (byStatus.recommendation ?? 0) + (byStatus.warning ?? 0) + (byStatus.blocked ?? 0),
    recommendations: byStatus.recommendation ?? 0,
    warnings: byStatus.warning ?? 0,
    blocked: byStatus.blocked ?? 0,
  };
}

function planGardening(root) {
  const findings = [];
  addLockHealthFindings(root, findings);
  addCaptureFindings(root, findings);
  addPlanFindings(root, findings);
  addStatusFindings(root, findings);
  addMemoryFindings(root, findings);
  addSnapshotFindings(root, findings);
  return { findings, summary: summarizeFindings(findings) };
}

function summarizeRules(root, rules) {
  const byStatus = {};
  const byKind = {};
  const bySeverity = {};
  const byTag = {};
  for (const rule of rules) {
    byStatus[rule.status] = (byStatus[rule.status] ?? 0) + 1;
    byKind[rule.kind] = (byKind[rule.kind] ?? 0) + 1;
    bySeverity[rule.severity] = (bySeverity[rule.severity] ?? 0) + 1;
    for (const tag of Array.isArray(rule.tags) ? rule.tags : []) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }
  const sortObject = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return {
    total: rules.length,
    by_status: sortObject(byStatus),
    by_kind: sortObject(byKind),
    by_severity: sortObject(bySeverity),
    by_tag: sortObject(byTag),
    files: {
      readme: existsSync(join(root, README_PATH)),
      rules: existsSync(join(root, RULES_PATH)),
      snapshots: existsSync(join(root, SNAPSHOTS_PATH)),
    },
  };
}

function printItems(label, items) {
  console.log(`${label}:`);
  if (items.length === 0) {
    console.log("  none");
    return;
  }
  for (const item of items) console.log(`  ${item}`);
}

function printHelp() {
  console.log(`harness garden

Usage:
  harness garden list [--target <path>] [--status <status>] [--kind <kind>] [--severity <severity>] [--tag <tag>] [--json]
  harness garden check [--target <path>] [--json]
  harness garden report [--target <path>] [--json]
  harness garden plan [--target <path>] [--json]

Commands:
  list    List gardening rules.
  check   Validate gardening rules and snapshots.
  report  Summarize gardening rules and current plan counts.
  plan    Generate a read-only cleanup-pressure plan.
`);
}

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function filtersFromArgs(args) {
  return {
    status: argValue(args, "--status"),
    kind: argValue(args, "--kind"),
    severity: argValue(args, "--severity"),
    tag: argValue(args, "--tag"),
  };
}

function filterRules(rules, filters) {
  return rules.filter((rule) => {
    if (filters.status && rule.status !== filters.status) return false;
    if (filters.kind && rule.kind !== filters.kind) return false;
    if (filters.severity && rule.severity !== filters.severity) return false;
    const tags = Array.isArray(rule.tags) ? rule.tags : [];
    if (filters.tag && !tags.includes(filters.tag)) return false;
    return true;
  });
}

function runList(root, args) {
  const result = validateGardening(root);
  const filters = filtersFromArgs(args);
  const rules = filterRules(result.rules, filters);
  const output = { ...result, filters, rules };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  if (result.errors.length > 0) printItems("errors", result.errors);
  if (result.warnings.length > 0) printItems("warnings", result.warnings);
  console.log("Harness gardening rules");
  console.log(`target: ${root}`);
  for (const rule of rules) console.log(`${rule.id} ${rule.status} ${rule.kind} ${rule.severity} ${rule.title}`);
  return output;
}

function runCheck(root, args) {
  const result = validateGardening(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log("Harness gardening check");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return result;
}

function printSummary(label, summary) {
  console.log(label);
  console.log(`  total: ${summary.total}`);
  for (const [name, value] of Object.entries(summary)) {
    if (!name.startsWith("by_")) continue;
    console.log(`  ${name}:`);
    for (const [key, count] of Object.entries(value)) console.log(`    ${key}: ${count}`);
  }
}

function runReport(root, args) {
  const result = validateGardening(root);
  const plan = planGardening(root);
  const output = { ...result, summary: summarizeRules(root, result.rules), plan_summary: plan.summary };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness gardening report");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printSummary("rules:", output.summary);
  printSummary("plan:", output.plan_summary);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return output;
}

function runPlan(root, args) {
  const result = validateGardening(root);
  const plan = planGardening(root);
  const output = {
    ok: result.ok,
    healthy: plan.summary.blocked === 0,
    root,
    errors: result.errors,
    warnings: result.warnings,
    summary: plan.summary,
    findings: plan.findings,
  };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness gardening plan");
  console.log(`target: ${root}`);
  console.log(`status: ${output.summary.attention > 0 ? "attention" : "clean"}`);
  printSummary("findings:", output.summary);
  for (const item of plan.findings.filter((entry) => entry.status !== "clean")) {
    console.log(`${item.status} ${item.kind} ${item.severity} ${item.id}: ${item.detail}`);
  }
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return output;
}

export function runGarden({ cwd = process.cwd(), args = [] } = {}) {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return { ok: true };
  }

  const targetArg = argValue(rest, "--target", cwd);
  const root = resolve(cwd, targetArg);

  if (subcommand === "list") return runList(root, rest);
  if (subcommand === "check") return runCheck(root, rest);
  if (subcommand === "report") return runReport(root, rest);
  if (subcommand === "plan") return runPlan(root, rest);

  console.error(`fail unknown garden command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runGarden({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
