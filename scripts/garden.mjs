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
const DEFAULT_THRESHOLDS = Object.freeze({
  open_capture_items: { recommendation: 1, warning: 4 },
  completed_plans: { recommendation: 40, warning: 60 },
  deferred_plans: { recommendation: 9, warning: 16 },
  status_lines: { recommendation: 650, warning: 900 },
  session_summary_lines: { recommendation: 120, warning: 200 },
  snapshot_lines: { recommendation: 120, warning: 200 },
});
const VALID_ACTION_POLICY_DEFAULTS = new Set(["read-only"]);
const ACTION_POLICY_LIST_FIELDS = ["reviewed_actions", "prohibited_without_confirmation"];

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

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function resolveThresholds(gardening) {
  const configured = isPlainObject(gardening?.thresholds) ? gardening.thresholds : {};
  return Object.fromEntries(Object.entries(DEFAULT_THRESHOLDS).map(([key, fallback]) => {
    const value = isPlainObject(configured[key]) ? configured[key] : {};
    return [key, {
      recommendation: value.recommendation ?? fallback.recommendation,
      warning: value.warning ?? fallback.warning,
    }];
  }));
}

function resolveActionPolicy(gardening) {
  const policy = isPlainObject(gardening?.action_policy) ? gardening.action_policy : {};
  return {
    default: policy.default ?? "read-only",
    reviewed_actions: Array.isArray(policy.reviewed_actions) ? policy.reviewed_actions : [],
    prohibited_without_confirmation: Array.isArray(policy.prohibited_without_confirmation)
      ? policy.prohibited_without_confirmation
      : [],
  };
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
    return {
      ok: false,
      root,
      errors,
      warnings,
      rules: [],
      thresholds: resolveThresholds(gardening),
      action_policy: resolveActionPolicy(gardening),
    };
  }

  if (gardening.version !== 1) {
    errors.push(`${RULES_PATH}: gardening.version must be 1`);
  }

  if (gardening.thresholds !== undefined) {
    if (!isPlainObject(gardening.thresholds)) {
      errors.push(`${RULES_PATH}: gardening.thresholds must be an object`);
    } else {
      for (const key of Object.keys(gardening.thresholds)) {
        if (!Object.hasOwn(DEFAULT_THRESHOLDS, key)) {
          warnings.push(`${RULES_PATH}: threshold '${key}' is not used by garden plan`);
          continue;
        }

        const value = gardening.thresholds[key];
        if (!isPlainObject(value)) {
          errors.push(`${RULES_PATH}: threshold '${key}' must be an object`);
          continue;
        }

        for (const field of ["recommendation", "warning"]) {
          if (value[field] !== undefined && !positiveInteger(value[field])) {
            errors.push(`${RULES_PATH}: threshold '${key}.${field}' must be a non-negative integer`);
          }
        }

        const resolved = {
          recommendation: value.recommendation ?? DEFAULT_THRESHOLDS[key].recommendation,
          warning: value.warning ?? DEFAULT_THRESHOLDS[key].warning,
        };
        if (positiveInteger(resolved.recommendation)
          && positiveInteger(resolved.warning)
          && resolved.warning < resolved.recommendation) {
          errors.push(`${RULES_PATH}: threshold '${key}.warning' must be greater than or equal to recommendation`);
        }
      }
    }
  }

  if (gardening.action_policy !== undefined) {
    if (!isPlainObject(gardening.action_policy)) {
      errors.push(`${RULES_PATH}: gardening.action_policy must be an object`);
    } else {
      if (gardening.action_policy.default !== undefined
        && !VALID_ACTION_POLICY_DEFAULTS.has(gardening.action_policy.default)) {
        errors.push(`${RULES_PATH}: gardening.action_policy.default must be read-only`);
      }
      for (const field of ACTION_POLICY_LIST_FIELDS) {
        const value = gardening.action_policy[field];
        if (value !== undefined && !Array.isArray(value)) {
          errors.push(`${RULES_PATH}: gardening.action_policy.${field} must be a list`);
          continue;
        }
        for (const item of Array.isArray(value) ? value : []) {
          if (typeof item !== "string" || item.trim() === "") {
            errors.push(`${RULES_PATH}: gardening.action_policy.${field} entries must be non-empty strings`);
          }
        }
      }
    }
  }

  if (!Array.isArray(gardening.rules)) {
    errors.push(`${RULES_PATH}: gardening.rules must be a list`);
    return {
      ok: false,
      root,
      errors,
      warnings,
      rules: [],
      thresholds: resolveThresholds(gardening),
      action_policy: resolveActionPolicy(gardening),
    };
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

  return {
    ok: errors.length === 0,
    root,
    errors,
    warnings,
    rules,
    thresholds: resolveThresholds(gardening),
    action_policy: resolveActionPolicy(gardening),
  };
}

function finding({ id, title, kind, status = "clean", severity = "info", action = "none", detail }) {
  return { id, title, kind, status, severity, action, detail };
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
      action: "restore-manifest-before-cleanup",
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
      action: "restore-lock-before-cleanup",
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
    action: missing === 0 && changed === 0 ? "none" : "review-lock-refresh",
    detail: missing === 0 && changed === 0
      ? "lock entries match installed files"
      : `${missing} missing lock entr${missing === 1 ? "y" : "ies"} and ${changed} changed fingerprint(s) should be reconciled`,
  }));
}

function thresholdStatus(count, threshold) {
  if (count >= threshold.warning) return "warning";
  if (count >= threshold.recommendation) return "recommendation";
  return "clean";
}

function thresholdSeverity(status) {
  if (status === "warning") return "medium";
  if (status === "recommendation") return "low";
  return "info";
}

function addCaptureFindings(root, findings, thresholds) {
  const inbox = readYamlIfPresent(root, "capture/inbox.yaml")?.capture_inbox;
  const items = Array.isArray(inbox?.items) ? inbox.items : [];
  const openItems = items.filter((item) => item.status === "open");
  const status = thresholdStatus(openItems.length, thresholds.open_capture_items);
  findings.push(finding({
    id: "capture-open-items",
    title: "Open capture items",
    kind: "capture-hygiene",
    status,
    severity: thresholdSeverity(status),
    action: status === "clean" ? "none" : "triage-or-promote-capture",
    detail: openItems.length > 0
      ? `${openItems.length} open capture item(s) should be triaged or promoted; recommendation threshold is ${thresholds.open_capture_items.recommendation}`
      : "no open capture items",
  }));
}

function addPlanFindings(root, findings, thresholds) {
  const plansStatus = readYamlIfPresent(root, "plans/current.yaml")?.plans_status;
  const plans = Array.isArray(plansStatus?.plans) ? plansStatus.plans : [];
  const completed = plans.filter((plan) => plan.status === "complete").length;
  const deferred = plans.filter((plan) => plan.status === "deferred").length;
  const blocked = plans.filter((plan) => plan.status === "blocked").length;
  const completedStatus = thresholdStatus(completed, thresholds.completed_plans);
  const deferredStatus = blocked > 0 ? "warning" : thresholdStatus(deferred, thresholds.deferred_plans);

  findings.push(finding({
    id: "completed-plan-volume",
    title: "Completed plan volume",
    kind: "plan-hygiene",
    status: completedStatus,
    severity: thresholdSeverity(completedStatus),
    action: completedStatus === "clean" ? "none" : "review-plan-archive",
    detail: completedStatus !== "clean"
      ? `${completed} completed plan(s) may need compression or archive review; recommendation threshold is ${thresholds.completed_plans.recommendation}`
      : `${completed} completed plan(s)`,
  }));

  findings.push(finding({
    id: "deferred-and-blocked-plan-volume",
    title: "Deferred and blocked plan volume",
    kind: "plan-hygiene",
    status: deferredStatus,
    severity: blocked > 0 ? "high" : thresholdSeverity(deferredStatus),
    action: deferredStatus === "clean" ? "none" : "review-deferred-or-blocked-plans",
    detail: `${deferred} deferred and ${blocked} blocked plan(s); deferred recommendation threshold is ${thresholds.deferred_plans.recommendation}`,
  }));
}

function addStatusFindings(root, findings, thresholds) {
  const lines = lineCount(root, "status.md");
  if (lines == null) {
    findings.push(finding({
      id: "status-projection-missing",
      title: "Status projection missing",
      kind: "status-hygiene",
      status: "warning",
      severity: "high",
      action: "restore-status-projection",
      detail: "status.md is missing",
    }));
    return;
  }

  const status = thresholdStatus(lines, thresholds.status_lines);
  findings.push(finding({
    id: "status-projection-size",
    title: "Status projection size",
    kind: "status-hygiene",
    status,
    severity: thresholdSeverity(status),
    action: status === "clean" ? "none" : "review-status-trim",
    detail: `status.md has ${lines} line(s); recommendation threshold is ${thresholds.status_lines.recommendation}`,
  }));
}

function addMemoryFindings(root, findings, thresholds) {
  const lines = lineCount(root, "memory/session-summaries.md");
  if (lines == null) return;
  const status = thresholdStatus(lines, thresholds.session_summary_lines);
  findings.push(finding({
    id: "session-summary-size",
    title: "Session summary size",
    kind: "memory-hygiene",
    status,
    severity: thresholdSeverity(status),
    action: status === "clean" ? "none" : "review-memory-summary-trim",
    detail: `memory/session-summaries.md has ${lines} line(s); recommendation threshold is ${thresholds.session_summary_lines.recommendation}`,
  }));
}

function addSnapshotFindings(root, findings, thresholds) {
  const snapshotPaths = [
    "reports/snapshots.md",
    "reconciliation/snapshots.md",
    "gardening/snapshots.md",
  ];
  for (const path of snapshotPaths) {
    const lines = lineCount(root, path);
    if (lines == null) continue;
    const status = thresholdStatus(lines, thresholds.snapshot_lines);
    findings.push(finding({
      id: `snapshot-size-${path.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "")}`,
      title: `Snapshot size ${path}`,
      kind: "stale-artifact",
      status,
      severity: thresholdSeverity(status),
      action: status === "clean" ? "none" : "review-snapshot-trim",
      detail: `${path} has ${lines} line(s); recommendation threshold is ${thresholds.snapshot_lines.recommendation}`,
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

function planGardening(root, gardening = null) {
  const findings = [];
  const thresholds = resolveThresholds(gardening);
  const actionPolicy = resolveActionPolicy(gardening);
  addLockHealthFindings(root, findings);
  addCaptureFindings(root, findings, thresholds);
  addPlanFindings(root, findings, thresholds);
  addStatusFindings(root, findings, thresholds);
  addMemoryFindings(root, findings, thresholds);
  addSnapshotFindings(root, findings, thresholds);
  return { findings, summary: summarizeFindings(findings), thresholds, action_policy: actionPolicy };
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
  const loaded = loadGardening(root);
  const plan = planGardening(root, loaded.gardening);
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
  const loaded = loadGardening(root);
  const plan = planGardening(root, loaded.gardening);
  const output = {
    ok: result.ok,
    healthy: plan.summary.blocked === 0,
    root,
    errors: result.errors,
    warnings: result.warnings,
    summary: plan.summary,
    thresholds: plan.thresholds,
    action_policy: plan.action_policy,
    findings: plan.findings,
  };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness gardening plan");
  console.log(`target: ${root}`);
  console.log(`status: ${output.summary.attention > 0 ? "attention" : "clean"}`);
  console.log(`policy: ${output.action_policy.default}`);
  printSummary("findings:", output.summary);
  for (const item of plan.findings.filter((entry) => entry.status !== "clean")) {
    console.log(`${item.status} ${item.kind} ${item.severity} ${item.id} [${item.action}]: ${item.detail}`);
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
