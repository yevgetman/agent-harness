#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDecisions } from "./decisions.mjs";
import { runDoctor } from "./doctor.mjs";
import { runInit } from "./init.mjs";
import { runQuestions } from "./questions.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assertExists(root, file) {
  assert.equal(existsSync(join(root, file)), true, `${file} should exist`);
}

function assertNotExists(root, file) {
  assert.equal(existsSync(join(root, file)), false, `${file} should not exist`);
}

function withTempDir(fn) {
  const root = mkdtempSync(join(tmpdir(), "harness-test-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function readFixture(file) {
  return readFileSync(join(REPO_ROOT, "fixtures", "doctor", file), "utf8");
}

function addDecisionsModule(target, { openQuestions, decision }) {
  const manifestPath = join(target, ".harness/manifest.yaml");
  const manifest = readFileSync(manifestPath, "utf8");
  const withModule = manifest.replace(
    "  managed_files:\n",
    `    - id: decisions-open-questions
      version: 0.1.0
      status: active
      process_domains:
        - decisions-and-open-questions
  managed_files:
`,
  );
  const withManagedFiles = withModule.replace(
    "  commands:\n",
    `    - path: open-questions.yaml
      owner: decisions-open-questions
      mode: merge
    - path: templates/decision.md
      owner: decisions-open-questions
      mode: merge
  commands:
`,
  );

  writeFileSync(manifestPath, withManagedFiles);

  mkdirSync(join(target, "modules", "decisions-open-questions"), { recursive: true });
  writeFileSync(
    join(target, "modules", "decisions-open-questions", "module.yaml"),
    readFileSync(join(REPO_ROOT, "modules", "decisions-open-questions", "module.yaml"), "utf8"),
  );

  mkdirSync(join(target, "templates"), { recursive: true });
  writeFileSync(
    join(target, "templates", "decision.md"),
    readFileSync(join(REPO_ROOT, "templates", "decision.md"), "utf8"),
  );

  mkdirSync(join(target, "decisions"), { recursive: true });
  writeFileSync(join(target, "open-questions.yaml"), readFixture(openQuestions));
  writeFileSync(join(target, "decisions", "0001-fixture-decision.md"), readFixture(decision));
}

withTempDir((root) => {
  const target = join(root, "target");

  const dryRun = runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal", "--dry-run", "--allow-non-git"],
  });
  assert.equal(dryRun.ok, true, "init --dry-run should pass");
  assertNotExists(target, "AGENTS.md");

  const nonGit = runInit({ cwd: root, args: ["--target", target, "--profile", "minimal"] });
  assert.equal(nonGit.ok, false, "init should refuse non-git targets by default");

  const init = runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal", "--allow-non-git"],
  });
  assert.equal(init.ok, true, "initial init should pass with explicit non-git override");

  for (const file of [
    "AGENTS.md",
    "status.md",
    "index.yaml",
    "state/CONTEXT.md",
    ".harness/manifest.yaml",
    "modules/agent-operating-contract/module.yaml",
    "modules/progressive-orientation/module.yaml",
  ]) {
    assertExists(target, file);
  }

  const agents = readFileSync(join(target, "AGENTS.md"), "utf8");
  assert.match(agents, /version: 0\.1\.0/, "installed AGENTS.md should include harness version");

  const doctor = runDoctor({ cwd: target });
  assert.equal(doctor.ok, true, "doctor should pass after init");

  const duplicate = runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal", "--allow-non-git"],
  });
  assert.equal(duplicate.ok, false, "init should refuse to overwrite without --force");

  const forced = runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal", "--force", "--allow-non-git"],
  });
  assert.equal(forced.ok, true, "init --force should overwrite and pass");
});

withTempDir((root) => {
  const bad = runInit({ cwd: root, args: ["--profile", "unknown", "--allow-non-git"] });
  assert.equal(bad.ok, false, "unsupported profile should fail");
});

withTempDir((root) => {
  const first = runDecisions({
    cwd: root,
    args: ["new", "Adopt test decision command"],
  });
  assert.equal(first.ok, true, "first decision should be created");
  assertExists(root, "decisions/0001-adopt-test-decision-command.md");

  const second = runDecisions({
    cwd: root,
    args: ["new", "--status", "accepted", "Add another decision: with colon"],
  });
  assert.equal(second.ok, true, "second decision should be created");
  assertExists(root, "decisions/0002-add-another-decision-with-colon.md");
  assert.match(
    readFileSync(join(root, "decisions/0002-add-another-decision-with-colon.md"), "utf8"),
    /status: accepted/,
    "decision --status should set initial status",
  );

  const list = runDecisions({ cwd: root, args: ["list"] });
  assert.equal(list.ok, true, "decisions list should pass");
  assert.equal(list.decisions.length, 2, "decisions list should return created decisions");

  const badStatus = runDecisions({
    cwd: root,
    args: ["new", "--status", "blocked", "Invalid status"],
  });
  assert.equal(badStatus.ok, false, "unsupported decision status should fail");

  const missingTitle = runDecisions({ cwd: root, args: ["new"] });
  assert.equal(missingTitle.ok, false, "missing decision title should fail");
});

withTempDir((root) => {
  writeFileSync(join(root, "open-questions.yaml"), readFixture("good-open-questions.yaml"));
  const questions = runQuestions({ cwd: root, args: ["list"] });
  assert.equal(questions.ok, true, "questions list should pass");
  assert.equal(questions.questions.length, 1, "questions list should return fixture questions");
});

withTempDir((root) => {
  const target = join(root, "target");
  const init = runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal", "--allow-non-git"],
  });
  assert.equal(init.ok, true, "init should pass before doctor fixture mutation");

  addDecisionsModule(target, {
    openQuestions: "bad-open-questions.yaml",
    decision: "good-decision.md",
  });
  const badQuestions = runDoctor({ cwd: target });
  assert.equal(badQuestions.ok, false, "doctor should reject invalid open question status");
  assert.equal(
    badQuestions.diagnostics.errors.some((item) => item.includes("invalid status 'blocked'")),
    true,
    "doctor should report invalid open question status",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  const init = runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal", "--allow-non-git"],
  });
  assert.equal(init.ok, true, "init should pass before doctor fixture mutation");

  addDecisionsModule(target, {
    openQuestions: "good-open-questions.yaml",
    decision: "bad-decision-id.md",
  });
  const badDecision = runDoctor({ cwd: target });
  assert.equal(badDecision.ok, false, "doctor should reject decision id mismatch");
  assert.equal(
    badDecision.diagnostics.errors.some((item) => item.includes("does not match filename id")),
    true,
    "doctor should report decision id mismatch",
  );
});

console.log("Harness tests: ok");
