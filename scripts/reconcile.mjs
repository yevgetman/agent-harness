#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateMetadata } from "./metadata.mjs";
import { validateCanonicalState } from "./state.mjs";
import { validatePlansStatus } from "./plans.mjs";
import { expectedLockPaths, hashFile, lockFileMap, readLock } from "./lock.mjs";

const RECONCILIATION_DIR = "reconciliation";
const README_PATH = "reconciliation/README.md";
const RULES_PATH = "reconciliation/rules.yaml";
const SNAPSHOTS_PATH = "reconciliation/snapshots.md";
const VALID_STATUSES = new Set(["active", "planned", "deprecated", "archived"]);
const VALID_KINDS = new Set([
  "manifest-lock",
  "profile",
  "module-registry",
  "command",
  "metadata-state",
  "plans-status",
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

function loadReconciliation(root) {
  const path = join(root, RULES_PATH);
  if (!existsSync(path)) {
    return { ok: false, errors: [`${RULES_PATH}: missing`], warnings: [], reconciliation: null, rules: [] };
  }

  try {
    const yaml = readYamlFile(path);
    const reconciliation = yaml?.reconciliation;
    if (!reconciliation) {
      return {
        ok: false,
        errors: [`${RULES_PATH}: missing top-level reconciliation key`],
        warnings: [],
        reconciliation: null,
        rules: [],
      };
    }

    return {
      ok: true,
      errors: [],
      warnings: [],
      reconciliation,
      rules: reconciliation.rules ?? [],
    };
  } catch (parseError) {
    return {
      ok: false,
      errors: [`${RULES_PATH}: YAML parse error: ${parseError.message}`],
      warnings: [],
      reconciliation: null,
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

export function validateReconciliation(root) {
  const loaded = loadReconciliation(root);
  const errors = [...loaded.errors];
  const warnings = [...loaded.warnings];
  const reconciliation = loaded.reconciliation;
  const rules = Array.isArray(loaded.rules) ? loaded.rules : [];

  if (!existsSync(join(root, RECONCILIATION_DIR))) {
    errors.push(`${RECONCILIATION_DIR}/: missing`);
  }

  checkMarkdownHeading(root, README_PATH, "# Reconciliation And Drift Detection", errors);
  checkMarkdownHeading(root, SNAPSHOTS_PATH, "# Reconciliation Snapshots", errors);

  if (!loaded.ok) {
    return { ok: false, root, errors, warnings, rules: [] };
  }

  if (reconciliation.version !== 1) {
    errors.push(`${RULES_PATH}: reconciliation.version must be 1`);
  }

  if (!Array.isArray(reconciliation.rules)) {
    errors.push(`${RULES_PATH}: reconciliation.rules must be a list`);
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
    if (!VALID_STATUSES.has(rule.status)) {
      errors.push(`${RULES_PATH}: rule '${id}' has invalid status '${rule.status}'`);
    }
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
  };
}

function finding({ id, title, kind, status = "clean", severity = "info", detail }) {
  return { id, title, kind, status, severity, detail };
}

function addManifestFindings(root, findings) {
  const manifestYaml = readYamlIfPresent(root, ".harness/manifest.yaml");
  const manifest = manifestYaml?.harness;

  if (!manifest) {
    findings.push(finding({
      id: "manifest-missing",
      title: "Installed manifest is missing",
      kind: "manifest-lock",
      status: "blocked",
      severity: "critical",
      detail: ".harness/manifest.yaml is required for reconciliation",
    }));
    return null;
  }

  findings.push(finding({
    id: "manifest-present",
    title: "Installed manifest is present",
    kind: "manifest-lock",
    detail: `${(manifest.modules ?? []).length} module(s), ${(manifest.managed_files ?? []).length} managed file(s)`,
  }));

  for (const file of manifest.managed_files ?? []) {
    if (!file?.path) continue;
    const exists = existsSync(join(root, file.path));
    findings.push(finding({
      id: `managed-file-${file.path.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "")}`,
      title: `Managed file ${file.path}`,
      kind: "manifest-lock",
      status: exists ? "clean" : "drift",
      severity: exists ? "info" : "high",
      detail: exists ? "managed file exists" : "managed file is missing",
    }));
  }

  return manifest;
}

function addLockFindings(root, manifest, findings) {
  const loaded = readLock(root);
  if (loaded.status === "missing") {
    findings.push(finding({
      id: "lock-missing",
      title: "Installed lock is missing",
      kind: "manifest-lock",
      status: "drift",
      severity: "high",
      detail: ".harness/lock.yaml is missing",
    }));
    return;
  }

  if (loaded.status === "invalid") {
    findings.push(finding({
      id: "lock-invalid",
      title: "Installed lock is invalid",
      kind: "manifest-lock",
      status: "blocked",
      severity: "critical",
      detail: loaded.error,
    }));
    return;
  }

  const lock = loaded.lock;
  findings.push(finding({
    id: "lock-present",
    title: "Installed lock is present",
    kind: "manifest-lock",
    detail: `${(lock.files ?? []).length} locked file(s)`,
  }));

  const locked = lockFileMap(lock);
  for (const expectedPath of expectedLockPaths(manifest, { root })) {
    const entry = locked.get(expectedPath);
    if (!entry) {
      findings.push(finding({
        id: `lock-entry-${expectedPath.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "")}`,
        title: `Lock entry ${expectedPath}`,
        kind: "manifest-lock",
        status: "drift",
        severity: "medium",
        detail: "expected lock entry is missing",
      }));
      continue;
    }

    if (!existsSync(join(root, expectedPath))) {
      findings.push(finding({
        id: `locked-file-${expectedPath.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "")}`,
        title: `Locked file ${expectedPath}`,
        kind: "manifest-lock",
        status: "drift",
        severity: "high",
        detail: "locked file is missing",
      }));
      continue;
    }

    const actual = hashFile(root, expectedPath);
    findings.push(finding({
      id: `lock-fingerprint-${expectedPath.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "")}`,
      title: `Lock fingerprint ${expectedPath}`,
      kind: "manifest-lock",
      status: actual === entry.sha256 ? "clean" : "drift",
      severity: actual === entry.sha256 ? "info" : "medium",
      detail: actual === entry.sha256 ? "lock fingerprint matches" : "file differs from lock fingerprint",
    }));
  }
}

function addProfileFindings(root, manifest, findings) {
  const profileId = manifest?.profile;
  if (!profileId) return;

  const profilePath = `profiles/${profileId}.yaml`;
  const profileYaml = readYamlIfPresent(root, profilePath);
  const profile = profileYaml?.profile;
  if (!profile) {
    findings.push(finding({
      id: "active-profile-missing",
      title: "Active profile definition is missing",
      kind: "profile",
      status: "warning",
      severity: "medium",
      detail: `${profilePath} is not available in this target`,
    }));
    return;
  }

  const installed = new Set((manifest.modules ?? []).map((module) => module.id));
  for (const moduleId of profile.modules ?? []) {
    findings.push(finding({
      id: `profile-module-${moduleId}`,
      title: `Active profile module ${moduleId}`,
      kind: "profile",
      status: installed.has(moduleId) ? "clean" : "drift",
      severity: installed.has(moduleId) ? "info" : "high",
      detail: installed.has(moduleId) ? "module is installed" : "active profile module is missing from manifest",
    }));
  }
}

function addRegistryFindings(root, manifest, findings) {
  const registryYaml = readYamlIfPresent(root, "modules/registry.yaml");
  const registryIds = new Set((registryYaml?.modules ?? []).map((entry) => entry.id).filter(Boolean));
  if (registryIds.size === 0) {
    findings.push(finding({
      id: "module-registry-unavailable",
      title: "Module registry is unavailable",
      kind: "module-registry",
      status: "warning",
      severity: "low",
      detail: "modules/registry.yaml is not available or has no modules",
    }));
    return;
  }

  for (const module of manifest?.modules ?? []) {
    findings.push(finding({
      id: `registry-module-${module.id}`,
      title: `Installed module registry entry ${module.id}`,
      kind: "module-registry",
      status: registryIds.has(module.id) ? "clean" : "drift",
      severity: registryIds.has(module.id) ? "info" : "medium",
      detail: registryIds.has(module.id) ? "installed module exists in registry" : "installed module is absent from registry",
    }));
  }
}

function commandStatus(root, command) {
  if (command === "npm test") {
    const packageJson = readYamlIfPresent(root, "package.json");
    return packageJson?.scripts?.test ? "clean" : "drift";
  }

  const npmRun = command.match(/^npm run ([^\s]+)$/);
  if (npmRun) {
    const packageJson = readYamlIfPresent(root, "package.json");
    return packageJson?.scripts?.[npmRun[1]] ? "clean" : "drift";
  }

  const nodeFile = command.match(/^node ([^\s]+)(?:\s|$)/);
  if (nodeFile) {
    return existsSync(join(root, nodeFile[1])) ? "clean" : "drift";
  }

  if (command.startsWith("harness ")) return "clean";
  return "warning";
}

function addCommandFindings(root, manifest, findings) {
  for (const [name, command] of Object.entries(manifest?.commands ?? {})) {
    const status = commandStatus(root, command);
    findings.push(finding({
      id: `command-${name}`,
      title: `Command ${name}`,
      kind: "command",
      status,
      severity: status === "clean" ? "info" : "medium",
      detail: status === "clean" ? "command wiring is present" : `command may not be wired: ${command}`,
    }));
  }
}

function addValidatorFindings(root, findings) {
  const validators = [
    { id: "metadata", kind: "metadata-state", path: "metadata/artifacts.yaml", label: "Structured Metadata", run: validateMetadata },
    { id: "canonical-state", kind: "metadata-state", path: "state/canonical-state.yaml", label: "Canonical State", run: validateCanonicalState },
    { id: "plans-status", kind: "plans-status", path: "plans/current.yaml", label: "Plans And Status", run: validatePlansStatus },
  ];

  for (const validator of validators) {
    if (!existsSync(join(root, validator.path))) continue;
    const result = validator.run(root);
    findings.push(finding({
      id: `${validator.id}-validation`,
      title: `${validator.label} validation`,
      kind: validator.kind,
      status: result.ok ? "clean" : "drift",
      severity: result.ok ? "info" : "medium",
      detail: result.ok
        ? `${validator.path} validates`
        : `${validator.path} has ${result.errors.length} error(s) and ${result.warnings.length} warning(s)`,
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
    drift: (byStatus.drift ?? 0) + (byStatus.blocked ?? 0),
  };
}

function planReconciliation(root) {
  const findings = [];
  const manifest = addManifestFindings(root, findings);
  if (manifest) {
    addLockFindings(root, manifest, findings);
    addProfileFindings(root, manifest, findings);
    addRegistryFindings(root, manifest, findings);
    addCommandFindings(root, manifest, findings);
  }
  addValidatorFindings(root, findings);
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
  console.log(`harness reconcile

Usage:
  harness reconcile list [--target <path>] [--status <status>] [--kind <kind>] [--severity <severity>] [--tag <tag>] [--json]
  harness reconcile check [--target <path>] [--json]
  harness reconcile report [--target <path>] [--json]
  harness reconcile plan [--target <path>] [--json]

Commands:
  list    List drift rules.
  check   Validate drift rules and snapshots.
  report  Summarize drift rules and current plan counts.
  plan    Generate a read-only local drift plan.
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
  const result = validateReconciliation(root);
  const filters = filtersFromArgs(args);
  const rules = filterRules(result.rules, filters);
  const output = { ...result, filters, rules };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  if (result.errors.length > 0) printItems("errors", result.errors);
  if (result.warnings.length > 0) printItems("warnings", result.warnings);
  console.log("Harness reconciliation rules");
  console.log(`target: ${root}`);
  for (const rule of rules) console.log(`${rule.id} ${rule.status} ${rule.kind} ${rule.severity} ${rule.title}`);
  return output;
}

function runCheck(root, args) {
  const result = validateReconciliation(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log("Harness reconciliation check");
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
  const result = validateReconciliation(root);
  const plan = planReconciliation(root);
  const output = { ...result, summary: summarizeRules(root, result.rules), plan_summary: plan.summary };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness reconciliation report");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printSummary("rules:", output.summary);
  printSummary("plan:", output.plan_summary);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return output;
}

function runPlan(root, args) {
  const result = validateReconciliation(root);
  const plan = planReconciliation(root);
  const output = {
    ok: result.ok,
    healthy: plan.summary.drift === 0,
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

  console.log("Harness reconciliation plan");
  console.log(`target: ${root}`);
  console.log(`status: ${output.healthy ? "clean" : "drift"}`);
  printSummary("findings:", output.summary);
  for (const item of plan.findings.filter((entry) => entry.status !== "clean")) {
    console.log(`${item.status} ${item.kind} ${item.severity} ${item.id}: ${item.detail}`);
  }
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return output;
}

export function runReconcile({ cwd = process.cwd(), args = [] } = {}) {
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

  console.error(`fail unknown reconcile command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runReconcile({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
