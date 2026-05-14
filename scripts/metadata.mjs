#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const METADATA_PATH = "metadata/artifacts.yaml";
const VALID_STATUSES = new Set(["active", "planned", "deprecated", "archived"]);

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function loadMetadata(root) {
  const path = join(root, METADATA_PATH);
  if (!existsSync(path)) {
    return { ok: false, errors: [`${METADATA_PATH}: missing`], warnings: [], artifacts: [] };
  }

  try {
    const yaml = readYamlFile(path);
    const metadata = yaml?.metadata;
    if (!metadata) {
      return { ok: false, errors: [`${METADATA_PATH}: missing top-level metadata key`], warnings: [], artifacts: [] };
    }

    return { ok: true, metadata, errors: [], warnings: [], artifacts: metadata.artifacts ?? [] };
  } catch (parseError) {
    return {
      ok: false,
      errors: [`${METADATA_PATH}: YAML parse error: ${parseError.message}`],
      warnings: [],
      artifacts: [],
    };
  }
}

export function validateMetadata(root) {
  const loaded = loadMetadata(root);
  const errors = [...loaded.errors];
  const warnings = [...loaded.warnings];
  const metadata = loaded.metadata;
  const artifacts = Array.isArray(loaded.artifacts) ? loaded.artifacts : [];

  if (!loaded.ok) {
    return { ok: false, root, errors, warnings, artifacts: [] };
  }

  if (metadata.version !== 1) {
    errors.push(`${METADATA_PATH}: metadata.version must be 1`);
  }

  if (!Array.isArray(metadata.artifacts)) {
    errors.push(`${METADATA_PATH}: metadata.artifacts must be a list`);
    return { ok: false, root, errors, warnings, artifacts: [] };
  }

  const ids = new Set();
  for (const artifact of artifacts) {
    const id = artifact?.id ?? "unknown";
    if (!artifact?.id) {
      errors.push(`${METADATA_PATH}: artifact missing id`);
      continue;
    }

    if (ids.has(artifact.id)) {
      errors.push(`${METADATA_PATH}: duplicate artifact id '${artifact.id}'`);
    }
    ids.add(artifact.id);

    if (!artifact.path) {
      errors.push(`${METADATA_PATH}: artifact '${id}' missing path`);
    }

    if (!artifact.kind) {
      errors.push(`${METADATA_PATH}: artifact '${id}' missing kind`);
    }

    if (!VALID_STATUSES.has(artifact.status)) {
      errors.push(`${METADATA_PATH}: artifact '${id}' has invalid status '${artifact.status}'`);
    }

    if (artifact.tags && !Array.isArray(artifact.tags)) {
      errors.push(`${METADATA_PATH}: artifact '${id}' tags must be a list`);
    }

    if (artifact.depends_on && !Array.isArray(artifact.depends_on)) {
      errors.push(`${METADATA_PATH}: artifact '${id}' depends_on must be a list`);
    }

    if (artifact.status === "active" && artifact.path && !existsSync(join(root, artifact.path))) {
      errors.push(`${METADATA_PATH}: active artifact '${id}' path '${artifact.path}' is missing`);
    }
  }

  for (const artifact of artifacts) {
    if (!artifact?.id || !Array.isArray(artifact.depends_on)) continue;
    for (const dependency of artifact.depends_on) {
      if (dependency === artifact.id) {
        errors.push(`${METADATA_PATH}: artifact '${artifact.id}' cannot depend on itself`);
      } else if (!ids.has(dependency)) {
        errors.push(`${METADATA_PATH}: artifact '${artifact.id}' depends on unknown artifact '${dependency}'`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    root,
    errors,
    warnings,
    artifacts,
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
  console.log(`harness metadata

Usage:
  harness metadata list [--target <path>] [--tag <tag>] [--kind <kind>] [--status <status>] [--json]
  harness metadata check [--target <path>] [--json]
  harness metadata report [--target <path>] [--json]

Commands:
  list     List structured metadata artifacts.
  check    Validate metadata/artifacts.yaml.
  report   Summarize metadata artifact counts by status, kind, and tag.
`);
}

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function filtersFromArgs(args) {
  return {
    tag: argValue(args, "--tag"),
    kind: argValue(args, "--kind"),
    status: argValue(args, "--status"),
  };
}

function filterArtifacts(artifacts, filters) {
  return artifacts.filter((artifact) => {
    if (filters.tag && !(artifact.tags ?? []).includes(filters.tag)) return false;
    if (filters.kind && artifact.kind !== filters.kind) return false;
    if (filters.status && artifact.status !== filters.status) return false;
    return true;
  });
}

function summarizeArtifacts(artifacts) {
  const byStatus = {};
  const byKind = {};
  const byTag = {};

  for (const artifact of artifacts) {
    byStatus[artifact.status] = (byStatus[artifact.status] ?? 0) + 1;
    byKind[artifact.kind] = (byKind[artifact.kind] ?? 0) + 1;
    for (const tag of artifact.tags ?? []) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }

  const sortObject = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return {
    total: artifacts.length,
    by_status: sortObject(byStatus),
    by_kind: sortObject(byKind),
    by_tag: sortObject(byTag),
  };
}

function printSummary(summary) {
  console.log(`total: ${summary.total}`);
  console.log("by_status:");
  for (const [status, count] of Object.entries(summary.by_status)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log("by_kind:");
  for (const [kind, count] of Object.entries(summary.by_kind)) {
    console.log(`  ${kind}: ${count}`);
  }
  console.log("by_tag:");
  for (const [tag, count] of Object.entries(summary.by_tag)) {
    console.log(`  ${tag}: ${count}`);
  }
}

function runList(root, args) {
  const result = validateMetadata(root);
  const filters = filtersFromArgs(args);
  const artifacts = filterArtifacts(result.artifacts, filters);
  const output = { ...result, filters, artifacts };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  if (result.errors.length > 0) {
    printItems("errors", result.errors);
  }

  console.log("Harness metadata artifacts");
  console.log(`target: ${root}`);
  for (const artifact of artifacts) {
    console.log(`${artifact.id} ${artifact.status} ${artifact.kind} ${artifact.path}`);
  }

  return output;
}

function runCheck(root, args) {
  const result = validateMetadata(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log("Harness metadata check");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return result;
}

function runReport(root, args) {
  const result = validateMetadata(root);
  const summary = summarizeArtifacts(result.artifacts);
  const output = { ...result, summary };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness metadata report");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printSummary(summary);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return output;
}

export function runMetadata({ cwd = process.cwd(), args = [] } = {}) {
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

  console.error(`fail unknown metadata command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runMetadata({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
