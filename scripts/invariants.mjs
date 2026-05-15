#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateCanonicalState } from "./state.mjs";

const INVARIANTS_PATH = "invariants/golden-principles.yaml";
const CANONICAL_STATE_PATH = "state/canonical-state.yaml";
const VALID_STATUSES = new Set(["active", "planned", "deprecated", "archived"]);
const VALID_SEVERITIES = new Set(["error", "warning"]);
const SUPPORTED_CHECK_TYPES = new Set(["file_exists", "file_contains"]);

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function loadInvariants(root) {
  const path = join(root, INVARIANTS_PATH);
  if (!existsSync(path)) {
    return { ok: false, errors: [`${INVARIANTS_PATH}: missing`], warnings: [], principles: [] };
  }

  try {
    const yaml = readYamlFile(path);
    const invariants = yaml?.invariants;
    if (!invariants) {
      return {
        ok: false,
        errors: [`${INVARIANTS_PATH}: missing top-level invariants key`],
        warnings: [],
        principles: [],
      };
    }

    return {
      ok: true,
      invariants,
      errors: [],
      warnings: [],
      principles: invariants.principles ?? [],
    };
  } catch (parseError) {
    return {
      ok: false,
      errors: [`${INVARIANTS_PATH}: YAML parse error: ${parseError.message}`],
      warnings: [],
      principles: [],
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

function addFailure({ severity, message, errors, warnings }) {
  if (severity === "warning") {
    warnings.push(message);
  } else {
    errors.push(message);
  }
}

function runCheck(root, principle, check, checkIndex, errors, warnings) {
  const severity = principle.severity ?? "error";
  const label = `${INVARIANTS_PATH}: principle '${principle.id}' check ${checkIndex + 1}`;

  if (!SUPPORTED_CHECK_TYPES.has(check?.type)) {
    errors.push(`${label} has unsupported type '${check?.type}'`);
    return { principle_id: principle.id, type: check?.type ?? "unknown", ok: false, detail: "unsupported check type" };
  }

  if (!check.path) {
    errors.push(`${label} missing path`);
    return { principle_id: principle.id, type: check.type, ok: false, detail: "missing path" };
  }

  const fullPath = join(root, check.path);
  if (!existsSync(fullPath)) {
    const message = `${label} path '${check.path}' is missing`;
    addFailure({ severity, message, errors, warnings });
    return { principle_id: principle.id, type: check.type, path: check.path, ok: false, detail: "path is missing" };
  }

  if (check.type === "file_exists") {
    return { principle_id: principle.id, type: check.type, path: check.path, ok: true, detail: "path exists" };
  }

  if (check.type === "file_contains") {
    if (typeof check.text !== "string" || check.text.length === 0) {
      errors.push(`${label} file_contains missing non-empty text`);
      return { principle_id: principle.id, type: check.type, path: check.path, ok: false, detail: "missing text" };
    }

    const text = readFileSync(fullPath, "utf8");
    if (!text.includes(check.text)) {
      const message = `${label} path '${check.path}' does not contain required text`;
      addFailure({ severity, message, errors, warnings });
      return {
        principle_id: principle.id,
        type: check.type,
        path: check.path,
        ok: false,
        detail: "required text not found",
      };
    }

    return { principle_id: principle.id, type: check.type, path: check.path, ok: true, detail: "required text found" };
  }

  return { principle_id: principle.id, type: check.type, ok: false, detail: "unsupported check type" };
}

export function validateInvariants(root) {
  const loaded = loadInvariants(root);
  const errors = [...loaded.errors];
  const warnings = [...loaded.warnings];
  const invariants = loaded.invariants;
  const principles = Array.isArray(loaded.principles) ? loaded.principles : [];
  const checkResults = [];

  if (!loaded.ok) {
    return { ok: false, root, errors, warnings, principles: [], check_results: [] };
  }

  if (invariants.version !== 1) {
    errors.push(`${INVARIANTS_PATH}: invariants.version must be 1`);
  }

  if (!Array.isArray(invariants.principles)) {
    errors.push(`${INVARIANTS_PATH}: invariants.principles must be a list`);
    return { ok: false, root, errors, warnings, principles: [], check_results: [] };
  }

  const ids = new Set();
  for (const principle of principles) {
    const id = principle?.id ?? "unknown";
    if (!principle?.id) {
      errors.push(`${INVARIANTS_PATH}: principle missing id`);
      continue;
    }

    if (ids.has(principle.id)) {
      errors.push(`${INVARIANTS_PATH}: duplicate principle id '${principle.id}'`);
    }
    ids.add(principle.id);

    if (!principle.title) {
      errors.push(`${INVARIANTS_PATH}: principle '${id}' missing title`);
    }

    if (!principle.statement) {
      errors.push(`${INVARIANTS_PATH}: principle '${id}' missing statement`);
    }

    if (!VALID_STATUSES.has(principle.status)) {
      errors.push(`${INVARIANTS_PATH}: principle '${id}' has invalid status '${principle.status}'`);
    }

    if (principle.severity && !VALID_SEVERITIES.has(principle.severity)) {
      errors.push(`${INVARIANTS_PATH}: principle '${id}' has invalid severity '${principle.severity}'`);
    }

    if (principle.tags && !Array.isArray(principle.tags)) {
      errors.push(`${INVARIANTS_PATH}: principle '${id}' tags must be a list`);
    }

    if (principle.checks && !Array.isArray(principle.checks)) {
      errors.push(`${INVARIANTS_PATH}: principle '${id}' checks must be a list`);
    }
  }

  const canonicalIds = canonicalStateIds(root, warnings);
  if (canonicalIds) {
    for (const principle of principles) {
      if (!principle?.canonical_state_id) continue;
      if (!canonicalIds.has(principle.canonical_state_id)) {
        errors.push(
          `${INVARIANTS_PATH}: principle '${principle.id}' canonical_state_id '${principle.canonical_state_id}' is unknown`,
        );
      }
    }
  }

  for (const principle of principles) {
    if (!principle?.id || principle.status !== "active" || !Array.isArray(principle.checks)) continue;
    principle.checks.forEach((check, index) => {
      checkResults.push(runCheck(root, principle, check, index, errors, warnings));
    });
  }

  return {
    ok: errors.length === 0,
    root,
    errors,
    warnings,
    principles,
    check_results: checkResults,
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
  console.log(`harness invariants

Usage:
  harness invariants check [--target <path>] [--json]

Commands:
  check    Validate invariants/golden-principles.yaml and run active checks.
`);
}

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function runCheckCommand(root, args) {
  const result = validateInvariants(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log("Harness invariants check");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  console.log(`principles: ${result.principles.length}`);
  console.log(`checks: ${result.check_results.length}`);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return result;
}

export function runInvariants({ cwd = process.cwd(), args = [] } = {}) {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return { ok: true };
  }

  const targetArg = argValue(rest, "--target", cwd);
  const root = resolve(cwd, targetArg);

  if (subcommand === "check") return runCheckCommand(root, rest);

  console.error(`fail unknown invariants command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runInvariants({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
