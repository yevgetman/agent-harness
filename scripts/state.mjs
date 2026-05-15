#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateMetadata } from "./metadata.mjs";

const CANONICAL_STATE_PATH = "state/canonical-state.yaml";
const METADATA_PATH = "metadata/artifacts.yaml";
const VALID_STATUSES = new Set(["active", "planned", "deprecated", "archived"]);
const VALID_STATE_ROLES = new Set([
  "source",
  "projection",
  "registry",
  "lifecycle",
  "generated",
  "scratch",
  "archive",
]);

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function loadCanonicalState(root) {
  const path = join(root, CANONICAL_STATE_PATH);
  if (!existsSync(path)) {
    return { ok: false, errors: [`${CANONICAL_STATE_PATH}: missing`], warnings: [], entries: [] };
  }

  try {
    const yaml = readYamlFile(path);
    const canonicalState = yaml?.canonical_state;
    if (!canonicalState) {
      return {
        ok: false,
        errors: [`${CANONICAL_STATE_PATH}: missing top-level canonical_state key`],
        warnings: [],
        entries: [],
      };
    }

    return {
      ok: true,
      canonicalState,
      errors: [],
      warnings: [],
      entries: canonicalState.entries ?? [],
    };
  } catch (parseError) {
    return {
      ok: false,
      errors: [`${CANONICAL_STATE_PATH}: YAML parse error: ${parseError.message}`],
      warnings: [],
      entries: [],
    };
  }
}

function metadataById(root, warnings) {
  if (!existsSync(join(root, METADATA_PATH))) return null;

  const result = validateMetadata(root);
  if (!result.ok) {
    warnings.push(`${METADATA_PATH}: metadata references were not checked because metadata validation failed`);
    return null;
  }

  const byId = new Map();
  for (const artifact of result.artifacts) {
    if (artifact?.id) byId.set(artifact.id, artifact);
  }
  return byId;
}

export function validateCanonicalState(root) {
  const loaded = loadCanonicalState(root);
  const errors = [...loaded.errors];
  const warnings = [...loaded.warnings];
  const canonicalState = loaded.canonicalState;
  const entries = Array.isArray(loaded.entries) ? loaded.entries : [];

  if (!loaded.ok) {
    return { ok: false, root, errors, warnings, entries: [] };
  }

  if (canonicalState.version !== 1) {
    errors.push(`${CANONICAL_STATE_PATH}: canonical_state.version must be 1`);
  }

  if (!Array.isArray(canonicalState.entries)) {
    errors.push(`${CANONICAL_STATE_PATH}: canonical_state.entries must be a list`);
    return { ok: false, root, errors, warnings, entries: [] };
  }

  const ids = new Set();
  for (const entry of entries) {
    const id = entry?.id ?? "unknown";
    if (!entry?.id) {
      errors.push(`${CANONICAL_STATE_PATH}: entry missing id`);
      continue;
    }

    if (ids.has(entry.id)) {
      errors.push(`${CANONICAL_STATE_PATH}: duplicate entry id '${entry.id}'`);
    }
    ids.add(entry.id);

    if (!entry.path) {
      errors.push(`${CANONICAL_STATE_PATH}: entry '${id}' missing path`);
    }

    if (!VALID_STATE_ROLES.has(entry.state_role)) {
      errors.push(`${CANONICAL_STATE_PATH}: entry '${id}' has invalid state_role '${entry.state_role}'`);
    }

    if (!VALID_STATUSES.has(entry.status)) {
      errors.push(`${CANONICAL_STATE_PATH}: entry '${id}' has invalid status '${entry.status}'`);
    }

    if (entry.depends_on && !Array.isArray(entry.depends_on)) {
      errors.push(`${CANONICAL_STATE_PATH}: entry '${id}' depends_on must be a list`);
    }

    if (entry.status === "active" && entry.path && !existsSync(join(root, entry.path))) {
      errors.push(`${CANONICAL_STATE_PATH}: active entry '${id}' path '${entry.path}' is missing`);
    }
  }

  for (const entry of entries) {
    if (!entry?.id || !Array.isArray(entry.depends_on)) continue;
    for (const dependency of entry.depends_on) {
      if (dependency === entry.id) {
        errors.push(`${CANONICAL_STATE_PATH}: entry '${entry.id}' cannot depend on itself`);
      } else if (!ids.has(dependency)) {
        errors.push(`${CANONICAL_STATE_PATH}: entry '${entry.id}' depends on unknown entry '${dependency}'`);
      }
    }
  }

  const metadata = metadataById(root, warnings);
  if (metadata) {
    for (const entry of entries) {
      if (!entry?.metadata_id) continue;
      const artifact = metadata.get(entry.metadata_id);
      if (!artifact) {
        errors.push(
          `${CANONICAL_STATE_PATH}: entry '${entry.id}' metadata_id '${entry.metadata_id}' is unknown`,
        );
        continue;
      }
      if (entry.path && artifact.path !== entry.path) {
        errors.push(
          `${CANONICAL_STATE_PATH}: entry '${entry.id}' path '${entry.path}' differs from metadata artifact '${entry.metadata_id}' path '${artifact.path}'`,
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    root,
    errors,
    warnings,
    entries,
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
  console.log(`harness state

Usage:
  harness state check [--target <path>] [--json]

Commands:
  check    Validate state/canonical-state.yaml.
`);
}

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function runCheck(root, args) {
  const result = validateCanonicalState(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log("Harness state check");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  console.log(`entries: ${result.entries.length}`);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return result;
}

export function runState({ cwd = process.cwd(), args = [] } = {}) {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return { ok: true };
  }

  const targetArg = argValue(rest, "--target", cwd);
  const root = resolve(cwd, targetArg);

  if (subcommand === "check") return runCheck(root, rest);

  console.error(`fail unknown state command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runState({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
