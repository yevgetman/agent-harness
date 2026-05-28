#!/usr/bin/env node

import { runDoctor } from "./doctor.mjs";
import { runInit } from "./init.mjs";
import { runDestroy } from "./destroy.mjs";
import { runDecisions } from "./decisions.mjs";
import { runQuestions } from "./questions.mjs";
import { runUpgrade } from "./upgrade.mjs";
import { runModules } from "./modules.mjs";
import { runProfiles } from "./profiles.mjs";
import { runLock } from "./lock.mjs";
import { runMetadata } from "./metadata.mjs";
import { runState } from "./state.mjs";
import { runInvariants } from "./invariants.mjs";
import { runPlans } from "./plans.mjs";
import { runCapture } from "./capture.mjs";
import { runMemory } from "./memory.mjs";
import { runDistribution } from "./distribution.mjs";

const [, , command, ...args] = process.argv;

function printHelp() {
  console.log(`harness

Usage:
  harness init     Install the full harness into the current target repo
  harness destroy  Plan or confirm removal of installed harness artifacts
  harness decisions new "<title>"
  harness decisions list
  harness questions list
  harness modules list
  harness modules add <module-id>
  harness profiles list
  harness profiles inspect <profile>
  harness profiles switch <profile> --plan
  harness profiles sync --plan
  harness metadata list
  harness metadata check
  harness metadata report
  harness state list
  harness state check
  harness state report
  harness invariants check
  harness plans list
  harness plans check
  harness plans report
  harness capture list
  harness capture add "<title>"
  harness capture triage --id <item-id> --status <status>
  harness capture check
  harness capture report
  harness memory list
  harness memory check
  harness memory report
  harness distribution check
  harness distribution global-smoke
  harness distribution release --plan
  harness distribution publish --plan
  harness distribution smoke
  harness lock refresh
  harness lock check
  harness upgrade --plan
  harness upgrade --plan --json
  harness upgrade
  harness upgrade apply
  harness doctor   Validate installed harness health
  harness help     Show this help
`);
}

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exitCode = 0;
} else if (command === "doctor") {
  const result = runDoctor({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "init") {
  const result = runInit({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "destroy") {
  const result = runDestroy({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "decisions") {
  const result = runDecisions({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "questions") {
  const result = runQuestions({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "upgrade") {
  const result = runUpgrade({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "modules") {
  const result = runModules({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "profiles") {
  const result = runProfiles({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "metadata") {
  const result = runMetadata({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "state") {
  const result = runState({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "invariants") {
  const result = runInvariants({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "plans") {
  const result = runPlans({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "capture") {
  const result = runCapture({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "memory") {
  const result = runMemory({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "distribution") {
  const result = runDistribution({ args });
  process.exitCode = result.ok ? 0 : 2;
} else if (command === "lock") {
  const result = runLock({ cwd: process.cwd(), args });
  process.exitCode = result.ok ? 0 : 2;
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 2;
}
