#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateCanonicalState } from "./state.mjs";

const PLANS_PATH = "plans/current.yaml";
const CANONICAL_STATE_PATH = "state/canonical-state.yaml";
const VALID_STATUSES = new Set(["planned", "active", "blocked", "complete", "deferred", "archived"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const ACTIONABLE_STATUSES = new Set(["active", "blocked"]);

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function loadPlansStatus(root) {
  const path = join(root, PLANS_PATH);
  if (!existsSync(path)) {
    return { ok: false, errors: [`${PLANS_PATH}: missing`], warnings: [], plans: [] };
  }

  try {
    const yaml = readYamlFile(path);
    const plansStatus = yaml?.plans_status;
    if (!plansStatus) {
      return {
        ok: false,
        errors: [`${PLANS_PATH}: missing top-level plans_status key`],
        warnings: [],
        plans: [],
      };
    }

    return {
      ok: true,
      plansStatus,
      errors: [],
      warnings: [],
      plans: plansStatus.plans ?? [],
    };
  } catch (parseError) {
    return {
      ok: false,
      errors: [`${PLANS_PATH}: YAML parse error: ${parseError.message}`],
      warnings: [],
      plans: [],
    };
  }
}

function canonicalStateIds(root, warnings) {
  if (!existsSync(join(root, CANONICAL_STATE_PATH))) return null;

  const result = validateCanonicalState(root);
  if (!result.ok) {
    warnings.push(`${CANONICAL_STATE_PATH}: canonical_state_id references were not checked because canonical state validation failed`);
    return null;
  }

  return new Set(result.entries.map((entry) => entry.id).filter(Boolean));
}

function validateStatusProjection(root, plansStatus, errors) {
  const projection = plansStatus.status_projection;
  if (typeof projection !== "string" || projection.trim() === "") {
    errors.push(`${PLANS_PATH}: status_projection must be a non-empty path`);
    return;
  }

  const fullPath = join(root, projection);
  if (!existsSync(fullPath)) {
    errors.push(`${PLANS_PATH}: status_projection '${projection}' is missing`);
    return;
  }

  const text = readFileSync(fullPath, "utf8");
  if (!text.includes("Last updated:")) {
    errors.push(`${PLANS_PATH}: status_projection '${projection}' must contain a Last updated line`);
  }
}

function validatePlanReferences(root, plan, errors) {
  if (!plan.references) return;
  if (!Array.isArray(plan.references)) {
    errors.push(`${PLANS_PATH}: plan '${plan.id}' references must be a list`);
    return;
  }

  for (const reference of plan.references) {
    if (typeof reference !== "string" || reference.trim() === "") {
      errors.push(`${PLANS_PATH}: plan '${plan.id}' has a non-string reference`);
      continue;
    }
    if (!existsSync(join(root, reference))) {
      errors.push(`${PLANS_PATH}: plan '${plan.id}' reference '${reference}' is missing`);
    }
  }
}

export function validatePlansStatus(root) {
  const loaded = loadPlansStatus(root);
  const errors = [...loaded.errors];
  const warnings = [...loaded.warnings];
  const plansStatus = loaded.plansStatus;
  const plans = Array.isArray(loaded.plans) ? loaded.plans : [];

  if (!loaded.ok) {
    return { ok: false, root, errors, warnings, plans: [] };
  }

  if (plansStatus.version !== 1) {
    errors.push(`${PLANS_PATH}: plans_status.version must be 1`);
  }

  validateStatusProjection(root, plansStatus, errors);

  if (!Array.isArray(plansStatus.plans)) {
    errors.push(`${PLANS_PATH}: plans_status.plans must be a list`);
    return { ok: false, root, errors, warnings, plans: [] };
  }

  const ids = new Set();
  for (const plan of plans) {
    const id = plan?.id ?? "unknown";
    if (!plan?.id) {
      errors.push(`${PLANS_PATH}: plan missing id`);
      continue;
    }

    if (ids.has(plan.id)) {
      errors.push(`${PLANS_PATH}: duplicate plan id '${plan.id}'`);
    }
    ids.add(plan.id);

    if (!plan.title) {
      errors.push(`${PLANS_PATH}: plan '${id}' missing title`);
    }

    if (!plan.summary) {
      errors.push(`${PLANS_PATH}: plan '${id}' missing summary`);
    }

    if (!VALID_STATUSES.has(plan.status)) {
      errors.push(`${PLANS_PATH}: plan '${id}' has invalid status '${plan.status}'`);
    }

    if (plan.priority && !VALID_PRIORITIES.has(plan.priority)) {
      errors.push(`${PLANS_PATH}: plan '${id}' has invalid priority '${plan.priority}'`);
    }

    if (ACTIONABLE_STATUSES.has(plan.status) && !plan.next_action) {
      errors.push(`${PLANS_PATH}: plan '${id}' with status '${plan.status}' must include next_action`);
    }

    if (plan.tags && !Array.isArray(plan.tags)) {
      errors.push(`${PLANS_PATH}: plan '${id}' tags must be a list`);
    }

    validatePlanReferences(root, plan, errors);
  }

  const canonicalIds = canonicalStateIds(root, warnings);
  if (canonicalIds) {
    for (const plan of plans) {
      if (!plan?.canonical_state_id) continue;
      if (!canonicalIds.has(plan.canonical_state_id)) {
        errors.push(`${PLANS_PATH}: plan '${plan.id}' canonical_state_id '${plan.canonical_state_id}' is unknown`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    root,
    errors,
    warnings,
    status_projection: plansStatus.status_projection,
    plans,
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
  console.log(`harness plans

Usage:
  harness plans list [--target <path>] [--status <status>] [--owner-domain <domain>] [--priority <priority>] [--json]
  harness plans check [--target <path>] [--json]
  harness plans report [--target <path>] [--status <status>] [--owner-domain <domain>] [--priority <priority>] [--json]

Commands:
  list     List plans/status entries.
  check    Validate plans/current.yaml.
  report   Summarize plans by status, priority, and owner domain.
`);
}

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function filtersFromArgs(args) {
  return {
    status: argValue(args, "--status"),
    owner_domain: argValue(args, "--owner-domain"),
    priority: argValue(args, "--priority"),
  };
}

function filterPlans(plans, filters) {
  return plans.filter((plan) => {
    if (filters.status && plan.status !== filters.status) return false;
    if (filters.owner_domain && plan.owner_domain !== filters.owner_domain) return false;
    if (filters.priority && plan.priority !== filters.priority) return false;
    return true;
  });
}

function summarizePlans(plans) {
  const byStatus = {};
  const byPriority = {};
  const byOwnerDomain = {};

  for (const plan of plans) {
    byStatus[plan.status] = (byStatus[plan.status] ?? 0) + 1;
    const priority = plan.priority ?? "unknown";
    byPriority[priority] = (byPriority[priority] ?? 0) + 1;
    const ownerDomain = plan.owner_domain ?? "unknown";
    byOwnerDomain[ownerDomain] = (byOwnerDomain[ownerDomain] ?? 0) + 1;
  }

  const sortObject = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return {
    total: plans.length,
    by_status: sortObject(byStatus),
    by_priority: sortObject(byPriority),
    by_owner_domain: sortObject(byOwnerDomain),
  };
}

function printSummary(summary) {
  console.log(`total: ${summary.total}`);
  console.log("by_status:");
  for (const [status, count] of Object.entries(summary.by_status)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log("by_priority:");
  for (const [priority, count] of Object.entries(summary.by_priority)) {
    console.log(`  ${priority}: ${count}`);
  }
  console.log("by_owner_domain:");
  for (const [ownerDomain, count] of Object.entries(summary.by_owner_domain)) {
    console.log(`  ${ownerDomain}: ${count}`);
  }
}

function runList(root, args) {
  const result = validatePlansStatus(root);
  const filters = filtersFromArgs(args);
  const plans = filterPlans(result.plans, filters);
  const output = { ...result, filters, plans };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  if (result.errors.length > 0) {
    printItems("errors", result.errors);
  }

  console.log("Harness plans");
  console.log(`target: ${root}`);
  for (const plan of plans) {
    console.log(`${plan.id} ${plan.status} ${plan.priority ?? "unknown"} ${plan.title}`);
  }

  return output;
}

function runCheck(root, args) {
  const result = validatePlansStatus(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log("Harness plans check");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  console.log(`plans: ${result.plans.length}`);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return result;
}

function runReport(root, args) {
  const result = validatePlansStatus(root);
  const filters = filtersFromArgs(args);
  const plans = filterPlans(result.plans, filters);
  const summary = summarizePlans(plans);
  const output = { ...result, filters, plans, summary };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness plans report");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printSummary(summary);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return output;
}

export function runPlans({ cwd = process.cwd(), args = [] } = {}) {
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

  console.error(`fail unknown plans command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runPlans({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
