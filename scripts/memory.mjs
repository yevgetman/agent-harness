#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const MEMORY_DIR = "memory";
const PREFERENCES_PATH = "memory/operator-preferences.yaml";
const REPO_NOTES_PATH = "memory/repo-notes.md";
const SESSION_SUMMARIES_PATH = "memory/session-summaries.md";
const README_PATH = "memory/README.md";
const VALID_STATUSES = new Set(["active", "deprecated", "archived"]);

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function loadMemory(root) {
  const path = join(root, PREFERENCES_PATH);
  if (!existsSync(path)) {
    return { ok: false, errors: [`${PREFERENCES_PATH}: missing`], warnings: [], memory: null, preferences: [] };
  }

  try {
    const yaml = readYamlFile(path);
    const memory = yaml?.memory;
    if (!memory) {
      return {
        ok: false,
        errors: [`${PREFERENCES_PATH}: missing top-level memory key`],
        warnings: [],
        memory: null,
        preferences: [],
      };
    }

    return {
      ok: true,
      errors: [],
      warnings: [],
      memory,
      preferences: memory.preferences ?? [],
    };
  } catch (parseError) {
    return {
      ok: false,
      errors: [`${PREFERENCES_PATH}: YAML parse error: ${parseError.message}`],
      warnings: [],
      memory: null,
      preferences: [],
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

export function validateMemory(root) {
  const loaded = loadMemory(root);
  const errors = [...loaded.errors];
  const warnings = [...loaded.warnings];
  const memory = loaded.memory;
  const preferences = Array.isArray(loaded.preferences) ? loaded.preferences : [];

  if (!existsSync(join(root, MEMORY_DIR))) {
    errors.push(`${MEMORY_DIR}/: missing`);
  }

  checkMarkdownHeading(root, README_PATH, "# Durable Memory", errors);
  checkMarkdownHeading(root, REPO_NOTES_PATH, "# Repo Notes", errors);
  checkMarkdownHeading(root, SESSION_SUMMARIES_PATH, "# Session Summaries", errors);

  if (!loaded.ok) {
    return { ok: false, root, errors, warnings, preferences: [] };
  }

  if (memory.version !== 1) {
    errors.push(`${PREFERENCES_PATH}: memory.version must be 1`);
  }

  if (!Array.isArray(memory.preferences)) {
    errors.push(`${PREFERENCES_PATH}: memory.preferences must be a list`);
    return { ok: false, root, errors, warnings, preferences: [] };
  }

  const ids = new Set();
  for (const preference of preferences) {
    const id = preference?.id ?? "unknown";
    if (!preference?.id) {
      errors.push(`${PREFERENCES_PATH}: preference missing id`);
      continue;
    }

    if (!/^[a-z0-9-]+$/.test(preference.id)) {
      errors.push(`${PREFERENCES_PATH}: preference '${preference.id}' id must be kebab-case`);
    }

    if (ids.has(preference.id)) {
      errors.push(`${PREFERENCES_PATH}: duplicate preference id '${preference.id}'`);
    }
    ids.add(preference.id);

    if (!preference.category) {
      errors.push(`${PREFERENCES_PATH}: preference '${id}' missing category`);
    }

    if (!VALID_STATUSES.has(preference.status)) {
      errors.push(`${PREFERENCES_PATH}: preference '${id}' has invalid status '${preference.status}'`);
    }

    if (!preference.statement) {
      errors.push(`${PREFERENCES_PATH}: preference '${id}' missing statement`);
    }

    if (preference.tags && !Array.isArray(preference.tags)) {
      errors.push(`${PREFERENCES_PATH}: preference '${id}' tags must be a list`);
    }
  }

  return {
    ok: errors.length === 0,
    root,
    errors,
    warnings,
    preferences,
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
  console.log(`harness memory

Usage:
  harness memory list [--target <path>] [--status <status>] [--category <category>] [--tag <tag>] [--json]
  harness memory check [--target <path>] [--json]
  harness memory report [--target <path>] [--json]

Commands:
  list     List durable operator preferences.
  check    Validate durable memory files.
  report   Summarize durable memory preferences and files.
`);
}

function argValue(args, flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function filtersFromArgs(args) {
  return {
    status: argValue(args, "--status"),
    category: argValue(args, "--category"),
    tag: argValue(args, "--tag"),
  };
}

function filterPreferences(preferences, filters) {
  return preferences.filter((preference) => {
    if (filters.status && preference.status !== filters.status) return false;
    if (filters.category && preference.category !== filters.category) return false;
    if (filters.tag && !(preference.tags ?? []).includes(filters.tag)) return false;
    return true;
  });
}

function summarizePreferences(root, preferences) {
  const byStatus = {};
  const byCategory = {};
  const byTag = {};

  for (const preference of preferences) {
    byStatus[preference.status] = (byStatus[preference.status] ?? 0) + 1;
    byCategory[preference.category] = (byCategory[preference.category] ?? 0) + 1;
    for (const tag of preference.tags ?? []) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }

  const sortObject = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return {
    total: preferences.length,
    by_status: sortObject(byStatus),
    by_category: sortObject(byCategory),
    by_tag: sortObject(byTag),
    files: {
      readme: existsSync(join(root, README_PATH)),
      operator_preferences: existsSync(join(root, PREFERENCES_PATH)),
      repo_notes: existsSync(join(root, REPO_NOTES_PATH)),
      session_summaries: existsSync(join(root, SESSION_SUMMARIES_PATH)),
    },
  };
}

function printSummary(summary) {
  console.log(`total: ${summary.total}`);
  console.log("by_status:");
  for (const [status, count] of Object.entries(summary.by_status)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log("by_category:");
  for (const [category, count] of Object.entries(summary.by_category)) {
    console.log(`  ${category}: ${count}`);
  }
  console.log("by_tag:");
  for (const [tag, count] of Object.entries(summary.by_tag)) {
    console.log(`  ${tag}: ${count}`);
  }
  console.log("files:");
  for (const [file, present] of Object.entries(summary.files)) {
    console.log(`  ${file}: ${present ? "present" : "missing"}`);
  }
}

function runList(root, args) {
  const result = validateMemory(root);
  const filters = filtersFromArgs(args);
  const preferences = filterPreferences(result.preferences, filters);
  const output = { ...result, filters, preferences };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  if (result.errors.length > 0) {
    printItems("errors", result.errors);
  }

  console.log("Harness durable memory preferences");
  console.log(`target: ${root}`);
  for (const preference of preferences) {
    console.log(`${preference.id} ${preference.status} ${preference.category} ${preference.statement}`);
  }
  return output;
}

function runCheck(root, args) {
  const result = validateMemory(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log("Harness memory check");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return result;
}

function runReport(root, args) {
  const result = validateMemory(root);
  const summary = summarizePreferences(root, result.preferences);
  const output = { ...result, summary };
  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log("Harness memory report");
  console.log(`target: ${root}`);
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  printSummary(summary);
  printItems("errors", result.errors);
  printItems("warnings", result.warnings);
  return output;
}

export function runMemory({ cwd = process.cwd(), args = [] } = {}) {
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

  console.error(`fail unknown memory command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runMemory({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
