import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function renderDecision({ id, title, date }) {
  return `---
id: ${id}
title: ${title}
status: proposed
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
  const title = args.join(" ").trim();
  if (!title) {
    console.error(`fail decisions new requires a title`);
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

  writeFileSync(path, renderDecision({ id, title, date: todayIso() }));
  console.log(`created decisions/${file}`);
  return { ok: true, path };
}

export function runDecisions({ cwd = process.cwd(), args = [] } = {}) {
  const root = resolve(cwd);
  const [subcommand, ...rest] = args;

  if (subcommand === "new") {
    return runNew({ root, args: rest });
  }

  console.error(`fail unknown decisions command '${subcommand ?? ""}'`);
  console.error(`usage: harness decisions new "<title>"`);
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runDecisions({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
