import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const VALID_STATUSES = new Set(["proposed", "accepted", "superseded", "reversed"]);

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "decision";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nextDecisionId(decisionsDir) {
  if (!existsSync(decisionsDir)) return 1;

  let max = 0;
  for (const file of readdirSync(decisionsDir)) {
    const match = file.match(/^(\d{4})-[a-z0-9-]+\.md$/);
    if (!match) continue;
    max = Math.max(max, Number.parseInt(match[1], 10));
  }

  return max + 1;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return null;
  return parseYaml(match[1]);
}

function parseNewArgs(args) {
  const titleParts = [];
  let status = "proposed";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--status") {
      status = args[i + 1] ?? "";
      i += 1;
      continue;
    }
    titleParts.push(arg);
  }

  return { title: titleParts.join(" ").trim(), status };
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function renderDecision({ id, title, date, status }) {
  return `---
id: ${id}
title: ${yamlString(title)}
status: ${status}
date: ${date}
supersedes: []
superseded_by: null
---

# ${title}

## Context

Describe the situation and constraints that made this decision necessary.

## Decision

State the decision directly.

## Consequences

List the practical consequences, including tradeoffs and follow-up work.
`;
}

function runNew({ root, args }) {
  const { title, status } = parseNewArgs(args);
  if (!title) {
    console.error("fail decisions new requires a title");
    return { ok: false };
  }

  if (!VALID_STATUSES.has(status)) {
    console.error(`fail unsupported decision status '${status}'`);
    console.error(`allowed: ${Array.from(VALID_STATUSES).join(", ")}`);
    return { ok: false };
  }

  const decisionsDir = join(root, "decisions");
  mkdirSync(decisionsDir, { recursive: true });

  const id = nextDecisionId(decisionsDir);
  const padded = String(id).padStart(4, "0");
  const file = `${padded}-${slugify(title)}.md`;
  const path = join(decisionsDir, file);

  if (existsSync(path)) {
    console.error(`fail decisions/${file}: already exists`);
    return { ok: false };
  }

  writeFileSync(path, renderDecision({ id, title, date: todayIso(), status }));
  console.log(`created decisions/${file}`);
  return { ok: true, path };
}

function runList({ root }) {
  const decisionsDir = join(root, "decisions");
  if (!existsSync(decisionsDir)) {
    console.log("No decisions directory found.");
    return { ok: true, decisions: [] };
  }

  const decisions = [];
  for (const file of readdirSync(decisionsDir).filter((entry) => entry.endsWith(".md")).sort()) {
    const text = readFileSync(join(decisionsDir, file), "utf8");
    let fm;
    try {
      fm = parseFrontmatter(text) ?? {};
    } catch (parseError) {
      console.error(`fail decisions/${file}: frontmatter parse error: ${parseError.message}`);
      return { ok: false };
    }
    decisions.push({
      file: `decisions/${file}`,
      id: fm.id ?? "?",
      status: fm.status ?? "unknown",
      title: fm.title ?? file,
    });
  }

  if (decisions.length === 0) {
    console.log("No decisions found.");
    return { ok: true, decisions };
  }

  for (const decision of decisions) {
    console.log(`${String(decision.id).padStart(4, "0")} ${decision.status} ${decision.title} (${decision.file})`);
  }

  return { ok: true, decisions };
}

function printHelp() {
  console.log(`harness decisions

Usage:
  harness decisions new [--status proposed|accepted|superseded|reversed] "<title>"
  harness decisions list
`);
}

export function runDecisions({ cwd = process.cwd(), args = [] } = {}) {
  const root = resolve(cwd);
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return { ok: true };
  }

  if (subcommand === "new") {
    return runNew({ root, args: rest });
  }

  if (subcommand === "list") {
    return runList({ root });
  }

  console.error(`fail unknown decisions command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runDecisions({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
