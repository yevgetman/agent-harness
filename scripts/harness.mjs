#!/usr/bin/env node

import { runDoctor } from "./doctor.mjs";
import { runInit } from "./init.mjs";
import { runDecisions } from "./decisions.mjs";
import { runQuestions } from "./questions.mjs";
import { runUpgrade } from "./upgrade.mjs";
import { runModules } from "./modules.mjs";

const [, , command, ...args] = process.argv;

function printHelp() {
  console.log(`harness

Usage:
  harness init     Install the minimal harness into a target repo
  harness decisions new "<title>"
  harness decisions list
  harness questions list
  harness modules list
  harness modules add <module-id>
  harness upgrade --plan
  harness doctor   Validate installed harness health
  harness help     Show this help
`);
}

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (command === "doctor") {
  const result = runDoctor({ cwd: process.cwd(), args });
  process.exit(result.ok ? 0 : 2);
}

if (command === "init") {
  const result = runInit({ cwd: process.cwd(), args });
  process.exit(result.ok ? 0 : 2);
}

if (command === "decisions") {
  const result = runDecisions({ cwd: process.cwd(), args });
  process.exit(result.ok ? 0 : 2);
}

if (command === "questions") {
  const result = runQuestions({ cwd: process.cwd(), args });
  process.exit(result.ok ? 0 : 2);
}

if (command === "upgrade") {
  const result = runUpgrade({ cwd: process.cwd(), args });
  process.exit(result.ok ? 0 : 2);
}

if (command === "modules") {
  const result = runModules({ cwd: process.cwd(), args });
  process.exit(result.ok ? 0 : 2);
}

console.error(`Unknown command: ${command}`);
printHelp();
process.exit(2);
