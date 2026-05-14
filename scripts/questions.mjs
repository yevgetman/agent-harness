import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

function printHelp() {
  console.log(`harness questions

Usage:
  harness questions list
`);
}

function runList({ root }) {
  const path = join(root, "open-questions.yaml");
  if (!existsSync(path)) {
    console.error("fail open-questions.yaml: missing");
    return { ok: false };
  }

  let questions;
  try {
    questions = parseYaml(readFileSync(path, "utf8"));
  } catch (parseError) {
    console.error(`fail open-questions.yaml: YAML parse error: ${parseError.message}`);
    return { ok: false };
  }
  if (!Array.isArray(questions)) {
    console.error("fail open-questions.yaml: expected a top-level list");
    return { ok: false };
  }

  if (questions.length === 0) {
    console.log("No open questions found.");
    return { ok: true, questions };
  }

  for (const question of questions) {
    const status = question.status ?? "unknown";
    const title = question.title ?? question.id ?? "untitled";
    const id = question.id ?? "missing-id";
    console.log(`${id} ${status} ${title}`);
  }

  return { ok: true, questions };
}

export function runQuestions({ cwd = process.cwd(), args = [] } = {}) {
  const root = resolve(cwd);
  const [subcommand] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return { ok: true };
  }

  if (subcommand === "list") {
    return runList({ root });
  }

  console.error(`fail unknown questions command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runQuestions({ cwd: process.cwd(), args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
