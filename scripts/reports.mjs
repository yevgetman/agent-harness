#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPORTS_DIR = "reports";
const README_PATH = "reports/README.md";
const CATALOG_PATH = "reports/catalog.yaml";
const SNAPSHOTS_PATH = "reports/snapshots.md";
const VALID_STATUSES = new Set(["active", "planned", "deprecated", "archived"]);
const VALID_KINDS = new Set([
  "cross-domain",
  "status",
  "validation",
  "inventory",
  "memory",
  "capture",
  "legibility",
  "lifecycle",
  "distribution",
  "custom",
]);

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

function loadReports(root) {
  const path = join(root, CATALOG_PATH);
  if (!existsSync(path)) {
    return { ok: false, errors: [`${CATALOG_PATH}: missing`], warnings: [], reports: null, definitions: [] };
  }

  try {
    const yaml = readYamlFile(path);
    const reports = yaml?.reports;
    if (!reports) {
      return {
        ok: false,
        errors: [`${CATALOG_PATH}: missing top-level reports key`],
        warnings: [],
        reports: null,
        definitions: [],
      };
    }

    return {
      ok: true,
      errors: [],
      warnings: [],
      reports,
      definitions: reports.definitions ?? [],
    };
  } catch (parseError) {
    return {
      ok: false,
      errors: [`${CATALOG_PATH}: YAML parse error: ${parseError.message}`],
      warnings: [],
      reports: null,
      definitions: [],
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

export function validateReports(root) {
  const loaded = loadReports(root);
  const errors = [...loaded.errors];
  const warnings = [...loaded.warnings];
  const reports = loaded.reports;
  const definitions = Array.isArray(loaded.definitions) ? loaded.definitions : [];

  if (!existsSync(join(root, REPORTS_DIR))) {
    errors.push(`${REPORTS_DIR}/: missing`);
  }

  checkMarkdownHeading(root, README_PATH, "# Reports And Retrieval", errors);
  checkMarkdownHeading(root, SNAPSHOTS_PATH, "# Report Snapshots", errors);

  if (!loaded.ok) {
    return { ok: false, root, errors, warnings, definitions: [] };
  }

  if (reports.version !== 1) {
    errors.push(`${CATALOG_PATH}: reports.version must be 1`);
  }

  if (!Array.isArray(reports.definitions)) {
    errors.push(`${CATALOG_PATH}: reports.definitions must be a list`);
    return { ok: false, root, errors, warnings, definitions: [] };
  }

  const ids = new Set();
  for (const definition of definitions) {
    const id = definition?.id ?? "unknown";
    if (!definition?.id) {
      errors.push(`${CATALOG_PATH}: report definition missing id`);
      continue;
    }

    if (!/^[a-z0-9-]+$/.test(definition.id)) {
      errors.push(`${CATALOG_PATH}: report '${definition.id}' id must be kebab-case`);
    }

    if (ids.has(definition.id)) {
      errors.push(`${CATALOG_PATH}: duplicate report id '${definition.id}'`);
    }
    ids.add(definition.id);

    if (!definition.title) {
      errors.push(`${CATALOG_PATH}: report '${id}' missing title`);
    }

    if (!VALID_KINDS.has(definition.kind)) {
      errors.push(`${CATALOG_PATH}: report '${id}' has invalid kind '${definition.kind}'`);
    }

    if (!VALID_STATUSES.has(definition.status)) {
      errors.push(`${CATALOG_PATH}: report '${id}' has invalid status '${definition.status}'`);
    }

    if (!definition.summary) {
      errors.push(`${CATALOG_PATH}: report '${id}' missing summary`);
    }

    if (definition.sources && !Array.isArray(definition.sources)) {
      errors.push(`${CATALOG_PATH}: report '${id}' sources must be a list`);
    }

    if (definition.tags && !Array.isArray(definition.tags)) {
      errors.push(`${CATALOG_PATH}: report '${id}' tags must be a list`);
    }

    const sources = Array.isArray(definition.sources) ? definition.sources : [];
    for (const source of sources) {
      if (typeof source !== "string" || source.trim() === "") {
        errors.push(`${CATALOG_PATH}: report '${id}' sources must be non-empty strings`);
        continue;
      }

      if (isLocalReference(source) && !existsSync(join(root, source))) {
        warnings.push(`${CATALOG_PATH}: report '${id}' source '${source}' is missing`);
      }
    }

    const tags = Array.isArray(definition.tags) ? definition.tags : [];
    for (const tag of tags) {
      if (typeof tag !== "string" || tag.trim() === "") {
        errors.push(`${CATALOG_PATH}: report '${id}' tags must be non-empty strings`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    root,
    errors,
    warnings,
    definitions,
  };
}

function countOpenQuestions(root) {
  const yaml = readYamlIfPresent(root, "open-questions.yaml");
  return Array.isArray(yaml) ? yaml.length : 0;
}

function countDecisions(root) {
  const dir = join(root, "decisions");
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((file) => /^\d{4}-.*\.md$/.test(file)).length;
}

function countList(value) {
  return Array.isArray(value) ? value.length : 0;
}

function collectInstalledOverview(root, definitions) {
  const manifest = readYamlIfPresent(root, ".harness/manifest.yaml")?.harness ?? {};
  const metadata = readYamlIfPresent(root, "metadata/artifacts.yaml")?.metadata ?? {};
  const canonicalState = readYamlIfPresent(root, "state/canonical-state.yaml")?.canonical_state ?? {};
  const plansStatus = readYamlIfPresent(root, "plans/current.yaml")?.plans_status ?? {};
  const captureInbox = readYamlIfPresent(root, "capture/inbox.yaml")?.capture_inbox ?? {};
  const captureTriage = readYamlIfPresent(root, "capture/triage.yaml")?.capture_triage ?? {};
  const memory = readYamlIfPresent(root, "memory/operator-preferences.yaml")?.memory ?? {};
  const legibility = readYamlIfPresent(root, "legibility/inventory.yaml")?.legibility ?? {};

  return {
    target: root,
    generated_on: new Date().toISOString().slice(0, 10),
    harness: {
      package: "portable-harness",
      profile: manifest.profile ?? null,
      modules: countList(manifest.modules),
      managed_files: countList(manifest.managed_files),
      commands: manifest.commands && typeof manifest.commands === "object"
        ? Object.keys(manifest.commands).length
        : 0,
    },
    registries: {
      metadata_artifacts: countList(metadata.artifacts),
      canonical_state_entries: countList(canonicalState.entries),
      plans: countList(plansStatus.plans),
      capture_items: countList(captureInbox.items),
      triage_records: countList(captureTriage.records),
      memory_preferences: countList(memory.preferences),
      legibility_surfaces: countList(legibility.surfaces),
      report_definitions: definitions.length,
      decisions: countDecisions(root),
      open_questions: countOpenQuestions(root),
    },
    files: {
      manifest: existsSync(join(root, ".harness/manifest.yaml")),
      lock: existsSync(join(root, ".harness/lock.yaml")),
      metadata: existsSync(join(root, "metadata/artifacts.yaml")),
      canonical_state: existsSync(join(root, "state/canonical-state.yaml")),
      plans: existsSync(join(root, "plans/current.yaml")),
      capture: existsSync(join(root, "capture/inbox.yaml")),
      memory: existsSync(join(root, "memory/operator-preferences.yaml")),
      legibility: existsSync(join(root, "legibility/inventory.yaml")),
      reports: existsSync(join(root, CATALOG_PATH)),
    },
  };
}

function summarizeDefinitions(root, definitions) {
  const byStatus = {};
  const byKind = {};
  const byTag = {};
  let sourceCount = 0;

  for (const definition of definitions) {
    byStatus[definition.status] = (byStatus[definition.status] ?? 0) + 1;
    byKind[definition.kind] = (byKind[definition.kind] ?? 0) + 1;
    const sources = Array.isArray(definition.sources) ? definition.sources : [];
    const tags = Array.isArray(definition.tags) ? definition.tags : [];
    sourceCount += sources.length;
    for (const tag of tags) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }

  const sortObject = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return {
    total: definitions.length,
    source_count: sourceCount,
    by_status: sortObject(byStatus),
    by_kind: sortObject(byKind),
    by_tag: sortObject(byTag),
    files: {
      readme: existsSync(join(root, README_PATH)),
      catalog: existsSync(join(root, CATALOG_PATH)),
      snapshots: existsSync(join(root, SNAPSHOTS_PATH)),
    },
  };
}

function selectReport(definitions, requestedId) {
  if (requestedId) {
    return definitions.find((definition) => definition.id === requestedId) ?? null;
  }

  return definitions.find((definition) => definition.status === "active")
    ?? definitions[0]
    ?? null;
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
  console.log(`harness reports

Usage:
  harness reports list [--target <path>] [--status <status>] [--kind <kind>] [--tag <tag>] [--json]
  harness reports check [--target <path>] [--json]
  harness reports report [--target <path>] [--json]
  harness reports generate [--target <path>] [--report <id>] [--json]

Commands:
  list      List report definitions.
  check     Validate the report catalog and snapshot file.
  report    Summarize report definitions and files.
  generate  Generate a lightweight installed-harness overview.
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

function filterDefinitions(definitions, filters) {
  return definitions.filter((definition) => {
    if (filters.status && definition.status !== filters.status) return false;
    if (filters.kind && definition.kind !== filters.kind) return false;
    const tags = Array.isArray(definition.tags) ? definition.tags : [];
    if (filters.tag && !tags.includes(filters.tag)) return false;
    return true;
  });
}

function printSummary(summary) {
  console.log(`total: ${summary.total}`);
  console.log(`source_count: ${summary.source_count}`);
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

function printGenerated(output) {
  console.log("Harness generated report");
  console.log(`target: ${output.root}`);
  console.log(`status: ${output.ok ? "ok" : "error"}`);
  console.log(`report: ${output.report_id ?? "none"}`);
  if (output.summary) {
    console.log("harness:");
    for (const [key, value] of Object.entries(output.summary.harness)) {
      console.log(`  ${key}: ${value}`);
    }
    console.log("registries:");
    for (const [key, value] of Object.entries(output.summary.registries)) {
      console.log(`  ${key}: ${value}`);
    }
  }
  printItems("errors", output.errors);
  printItems("warnings", output.warnings);
}

function runList(root, args) {
  const result = validateReports(root);
  const filters = filtersFromArgs(args);
  const definitions = filterDefinitions(result.definitions, filters);
  const output = { ...result, filters, definitions };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  if (result.errors.length > 0) printItems("errors", result.errors);
  if (result.warnings.length > 0) printItems("warnings", result.warnings);
  console.log("Harness report catalog");
  console.log(`target: ${root}`);
  for (const definition of definitions) {
    console.log(`${definition.id} ${definition.status} ${definition.kind} ${definition.title}`);
  }
  return output;
}

function runCheck(root, args) {
  const result = validateReports(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log("Harness reports check");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return result;
}

function runReport(root, args) {
  const result = validateReports(root);
  const summary = summarizeDefinitions(root, result.definitions);
  const output = { ...result, summary };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness reports summary");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printSummary(summary);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return output;
}

function runGenerate(root, args) {
  const result = validateReports(root);
  const requestedId = argValue(args, "--report");
  const definition = result.ok ? selectReport(result.definitions, requestedId) : null;
  const errors = [...result.errors];

  if (result.ok && !definition) {
    errors.push(requestedId
      ? `${CATALOG_PATH}: unknown report '${requestedId}'`
      : `${CATALOG_PATH}: no report definitions available`);
  }

  const output = {
    ok: errors.length === 0,
    root,
    errors,
    warnings: result.warnings,
    report_id: definition?.id ?? requestedId ?? null,
    report: definition ?? null,
    summary: definition ? collectInstalledOverview(root, result.definitions) : null,
  };

  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  printGenerated(output);
  return output;
}

export function runReports({ cwd = process.cwd(), args = [] } = {}) {
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
  if (subcommand === "generate") return runGenerate(root, rest);

  console.error(`fail unknown reports command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runReports({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
