#!/usr/bin/env node

import { runDoctor } from "./doctor.mjs";
import { runInit } from "./init.mjs";

const [, , command, ...args] = process.argv;

function printHelp() {
  console.log(`harness

Usage:
  harness init     Install the minimal harness into a target repo
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

console.error(`Unknown command: ${command}`);
printHelp();
process.exit(2);
