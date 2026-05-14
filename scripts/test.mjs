#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDecisions } from "./decisions.mjs";
import { runDoctor } from "./doctor.mjs";
import { runInit } from "./init.mjs";

function assertExists(root, file) {
  assert.equal(existsSync(join(root, file)), true, `${file} should exist`);
}

function withTempDir(fn) {
  const root = mkdtempSync(join(tmpdir(), "harness-test-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

withTempDir((root) => {
  const target = join(root, "target");

  const init = runInit({ cwd: root, args: ["--target", target, "--profile", "minimal"] });
  assert.equal(init.ok, true, "initial init should pass");

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

  const doctor = runDoctor({ cwd: target });
  assert.equal(doctor.ok, true, "doctor should pass after init");

  const duplicate = runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  });
  assert.equal(duplicate.ok, false, "init should refuse to overwrite without --force");

  const forced = runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal", "--force"],
  });
  assert.equal(forced.ok, true, "init --force should overwrite and pass");
});

withTempDir((root) => {
  const bad = runInit({ cwd: root, args: ["--profile", "unknown"] });
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
    args: ["new", "Add another decision"],
  });
  assert.equal(second.ok, true, "second decision should be created");
  assertExists(root, "decisions/0002-add-another-decision.md");

  const missingTitle = runDecisions({ cwd: root, args: ["new"] });
  assert.equal(missingTitle.ok, false, "missing decision title should fail");
});

console.log("Harness tests: ok");
