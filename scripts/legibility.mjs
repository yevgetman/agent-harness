#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const LEGIBILITY_DIR = "legibility";
const README_PATH = "legibility/README.md";
const INVENTORY_PATH = "legibility/inventory.yaml";
const NOTES_PATH = "legibility/notes.md";
const VALID_STATUSES = new Set(["active", "planned", "missing", "deprecated", "archived"]);
const VALID_KINDS = new Set([
  "entrypoint",
  "command",
  "check",
  "test",
  "health-check",
  "log",
  "fixture",
  "runtime-note",
  "screenshot",
  "metric",
  "trace",
  "source-map",
  "corpus-index",
  "generated-report",
  "smoke-target",
  "doc",
]);

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function loadLegibility(root) {
  const path = join(root, INVENTORY_PATH);
  if (!existsSync(path)) {
    return { ok: false, errors: [`${INVENTORY_PATH}: missing`], warnings: [], legibility: null, surfaces: [] };
  }

  try {
    const yaml = readYamlFile(path);
    const legibility = yaml?.legibility;
    if (!legibility) {
      return {
        ok: false,
        errors: [`${INVENTORY_PATH}: missing top-level legibility key`],
        warnings: [],
        legibility: null,
        surfaces: [],
      };
    }

    return {
      ok: true,
      errors: [],
      warnings: [],
      legibility,
      surfaces: legibility.surfaces ?? [],
    };
  } catch (parseError) {
    return {
      ok: false,
      errors: [`${INVENTORY_PATH}: YAML parse error: ${parseError.message}`],
      warnings: [],
      legibility: null,
      surfaces: [],
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

export function validateLegibility(root) {
  const loaded = loadLegibility(root);
  const errors = [...loaded.errors];
  const warnings = [...loaded.warnings];
  const legibility = loaded.legibility;
  const surfaces = Array.isArray(loaded.surfaces) ? loaded.surfaces : [];

  if (!existsSync(join(root, LEGIBILITY_DIR))) {
    errors.push(`${LEGIBILITY_DIR}/: missing`);
  }

  checkMarkdownHeading(root, README_PATH, "# Application / Corpus Legibility", errors);
  checkMarkdownHeading(root, NOTES_PATH, "# Legibility Notes", errors);

  if (!loaded.ok) {
    return { ok: false, root, errors, warnings, surfaces: [] };
  }

  if (legibility.version !== 1) {
    errors.push(`${INVENTORY_PATH}: legibility.version must be 1`);
  }

  if (!Array.isArray(legibility.surfaces)) {
    errors.push(`${INVENTORY_PATH}: legibility.surfaces must be a list`);
    return { ok: false, root, errors, warnings, surfaces: [] };
  }

  const ids = new Set();
  for (const surface of surfaces) {
    const id = surface?.id ?? "unknown";
    if (!surface?.id) {
      errors.push(`${INVENTORY_PATH}: surface missing id`);
      continue;
    }

    if (!/^[a-z0-9-]+$/.test(surface.id)) {
      errors.push(`${INVENTORY_PATH}: surface '${surface.id}' id must be kebab-case`);
    }

    if (ids.has(surface.id)) {
      errors.push(`${INVENTORY_PATH}: duplicate surface id '${surface.id}'`);
    }
    ids.add(surface.id);

    if (!surface.title) {
      errors.push(`${INVENTORY_PATH}: surface '${id}' missing title`);
    }

    if (!VALID_KINDS.has(surface.kind)) {
      errors.push(`${INVENTORY_PATH}: surface '${id}' has invalid kind '${surface.kind}'`);
    }

    if (!VALID_STATUSES.has(surface.status)) {
      errors.push(`${INVENTORY_PATH}: surface '${id}' has invalid status '${surface.status}'`);
    }

    if (!surface.summary) {
      errors.push(`${INVENTORY_PATH}: surface '${id}' missing summary`);
    }

    if (!surface.how_to_inspect) {
      errors.push(`${INVENTORY_PATH}: surface '${id}' missing how_to_inspect`);
    }

    if (surface.commands && !Array.isArray(surface.commands)) {
      errors.push(`${INVENTORY_PATH}: surface '${id}' commands must be a list`);
    }

    if (surface.references && !Array.isArray(surface.references)) {
      errors.push(`${INVENTORY_PATH}: surface '${id}' references must be a list`);
    }

    if (surface.tags && !Array.isArray(surface.tags)) {
      errors.push(`${INVENTORY_PATH}: surface '${id}' tags must be a list`);
    }

    const commands = Array.isArray(surface.commands) ? surface.commands : [];
    const references = Array.isArray(surface.references) ? surface.references : [];

    for (const command of commands) {
      if (typeof command !== "string" || command.trim() === "") {
        errors.push(`${INVENTORY_PATH}: surface '${id}' commands must be non-empty strings`);
      }
    }

    for (const reference of references) {
      if (typeof reference !== "string" || reference.trim() === "") {
        errors.push(`${INVENTORY_PATH}: surface '${id}' references must be non-empty strings`);
        continue;
      }

      if (isLocalReference(reference) && !existsSync(join(root, reference))) {
        warnings.push(`${INVENTORY_PATH}: surface '${id}' reference '${reference}' is missing`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    root,
    errors,
    warnings,
    surfaces,
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
  console.log(`harness legibility

Usage:
  harness legibility list [--target <path>] [--status <status>] [--kind <kind>] [--tag <tag>] [--json]
  harness legibility check [--target <path>] [--json]
  harness legibility report [--target <path>] [--json]

Commands:
  list    List application/corpus inspection surfaces.
  check   Validate legibility inventory and notes.
  report  Summarize inspection surfaces and files.
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
    tag: argValue(args, "--tag"),
  };
}

function filterSurfaces(surfaces, filters) {
  return surfaces.filter((surface) => {
    if (filters.status && surface.status !== filters.status) return false;
    if (filters.kind && surface.kind !== filters.kind) return false;
    const tags = Array.isArray(surface.tags) ? surface.tags : [];
    if (filters.tag && !tags.includes(filters.tag)) return false;
    return true;
  });
}

function summarizeSurfaces(root, surfaces) {
  const byStatus = {};
  const byKind = {};
  const byTag = {};
  let commandCount = 0;
  let referenceCount = 0;

  for (const surface of surfaces) {
    byStatus[surface.status] = (byStatus[surface.status] ?? 0) + 1;
    byKind[surface.kind] = (byKind[surface.kind] ?? 0) + 1;
    const commands = Array.isArray(surface.commands) ? surface.commands : [];
    const references = Array.isArray(surface.references) ? surface.references : [];
    const tags = Array.isArray(surface.tags) ? surface.tags : [];
    commandCount += commands.length;
    referenceCount += references.length;
    for (const tag of tags) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }

  const sortObject = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return {
    total: surfaces.length,
    command_count: commandCount,
    reference_count: referenceCount,
    by_status: sortObject(byStatus),
    by_kind: sortObject(byKind),
    by_tag: sortObject(byTag),
    files: {
      readme: existsSync(join(root, README_PATH)),
      inventory: existsSync(join(root, INVENTORY_PATH)),
      notes: existsSync(join(root, NOTES_PATH)),
    },
  };
}

function printSummary(summary) {
  console.log(`total: ${summary.total}`);
  console.log(`command_count: ${summary.command_count}`);
  console.log(`reference_count: ${summary.reference_count}`);
  for (const [label, value] of [
    ["by_status", summary.by_status],
    ["by_kind", summary.by_kind],
    ["by_tag", summary.by_tag],
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

function runList(root, args) {
  const result = validateLegibility(root);
  const filters = filtersFromArgs(args);
  const surfaces = filterSurfaces(result.surfaces, filters);
  const output = { ...result, filters, surfaces };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  if (result.errors.length > 0) printItems("errors", result.errors);
  if (result.warnings.length > 0) printItems("warnings", result.warnings);
  console.log("Harness legibility inventory");
  console.log(`target: ${root}`);
  for (const surface of surfaces) {
    console.log(`${surface.id} ${surface.status} ${surface.kind} ${surface.title}`);
  }
  return output;
}

function runCheck(root, args) {
  const result = validateLegibility(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log("Harness legibility check");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return result;
}

function runReport(root, args) {
  const result = validateLegibility(root);
  const summary = summarizeSurfaces(root, result.surfaces);
  const output = { ...result, summary };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness legibility report");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printSummary(summary);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return output;
}

export function runLegibility({ cwd = process.cwd(), args = [] } = {}) {
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

  console.error(`fail unknown legibility command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runLegibility({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
