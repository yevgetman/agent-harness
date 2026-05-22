#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { runDecisions } from "./decisions.mjs";
import { runDistribution } from "./distribution.mjs";
import { runDoctor } from "./doctor.mjs";
import { runInvariants } from "./invariants.mjs";
import { runInit } from "./init.mjs";
import { runLock } from "./lock.mjs";
import { runMetadata } from "./metadata.mjs";
import { runModules } from "./modules.mjs";
import { runPlans } from "./plans.mjs";
import { runProfiles } from "./profiles.mjs";
import { runQuestions } from "./questions.mjs";
import { runState } from "./state.mjs";
import { runUpgrade } from "./upgrade.mjs";

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

function quiet(fn) {
  const log = console.log;
  const error = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.error = error;
  }
}

function readFixture(file) {
  return readFileSync(join(REPO_ROOT, "fixtures", "doctor", file), "utf8");
}

function readLock(root) {
  return parseYaml(readFileSync(join(root, ".harness", "lock.yaml"), "utf8")).lock;
}

function writeLock(root, lock) {
  writeFileSync(join(root, ".harness", "lock.yaml"), stringifyYaml({ lock }));
}

function setManifestProfile(root, profile) {
  const manifestPath = join(root, ".harness", "manifest.yaml");
  const manifest = parseYaml(readFileSync(manifestPath, "utf8"));
  manifest.harness.profile = profile;
  writeFileSync(manifestPath, stringifyYaml(manifest));
}

function hasOperation(plan, code, subject = null) {
  return plan.operations.some((operation) =>
    operation.code === code && (subject == null || operation.subject === subject),
  );
}

function registryFixture({
  packageName,
  distTag = "latest",
  status,
  version = null,
  detail,
}) {
  return {
    type: "npm",
    package: packageName,
    dist_tag: distTag,
    registry: "https://registry.npmjs.org/",
    status,
    version,
    detail,
  };
}

function unpublishedRegistry({ packageName, distTag = "latest" }) {
  return registryFixture({
    packageName,
    distTag,
    status: "unpublished-or-private",
    detail: "fixture unpublished/private package",
  });
}

function availableRegistry(version) {
  return ({ packageName, distTag = "latest" }) => registryFixture({
    packageName,
    distTag,
    status: "available",
    version,
    detail: "fixture available version",
  });
}

function runTestUpgrade(options = {}) {
  return runUpgrade({ registryDiscovery: unpublishedRegistry, ...options });
}

function withRegistryDiscoverySkip(fn) {
  const previous = process.env.HARNESS_REGISTRY_DISCOVERY;
  process.env.HARNESS_REGISTRY_DISCOVERY = "skip";
  try {
    return fn();
  } finally {
    if (previous == null) {
      delete process.env.HARNESS_REGISTRY_DISCOVERY;
    } else {
      process.env.HARNESS_REGISTRY_DISCOVERY = previous;
    }
  }
}

function initGitRepo(path) {
  mkdirSync(path, { recursive: true });
  execFileSync("git", ["init"], { cwd: path, stdio: "ignore" });
}

function createMissingArtifactSource(root) {
  const sourceRoot = join(root, "source");
  mkdirSync(join(sourceRoot, "modules", "broken-module"), { recursive: true });

  writeFileSync(
    join(sourceRoot, "modules", "registry.yaml"),
    `modules:
  - id: broken-module
    path: modules/broken-module/module.yaml
    status: active
    installable: true
`,
  );

  writeFileSync(
    join(sourceRoot, "modules", "broken-module", "module.yaml"),
    `module:
  id: broken-module
  version: 0.1.0
  status: active
  process_domains:
    - broken-domain
  install:
    artifacts:
      - path: broken.txt
        type: template
        source: modules/broken-module/templates/missing.txt
`,
  );

  return sourceRoot;
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

  const dryRun = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal", "--dry-run", "--allow-non-git"],
  }));
  assert.equal(dryRun.ok, true, "init --dry-run should pass");
  assertNotExists(target, "AGENTS.md");

  const nonGit = quiet(() => runInit({ cwd: root, args: ["--target", target, "--profile", "minimal"] }));
  assert.equal(nonGit.ok, false, "init should refuse non-git targets by default");

  const gitTarget = join(root, "git-target");
  initGitRepo(gitTarget);

  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", gitTarget, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "initial init should pass in a git repo");

  for (const file of [
    "AGENTS.md",
    "status.md",
    "index.yaml",
    "state/CONTEXT.md",
    ".harness/manifest.yaml",
    ".harness/lock.yaml",
    "modules/agent-operating-contract/module.yaml",
    "modules/progressive-orientation/module.yaml",
  ]) {
    assertExists(gitTarget, file);
  }

  const agents = readFileSync(join(gitTarget, "AGENTS.md"), "utf8");
  assert.match(agents, /version: 0\.1\.0/, "installed AGENTS.md should include harness version");
  assert.match(
    agents,
    /source does not track this repo/,
    "installed AGENTS.md should explain the installed-instance boundary",
  );
  const initializedManifest = parseYaml(readFileSync(join(gitTarget, ".harness", "manifest.yaml"), "utf8")).harness;
  assert.equal(
    initializedManifest.source.install_model,
    "installed-instance",
    "init should record the installed-instance source model",
  );
  assert.equal(
    initializedManifest.source.registry_tag,
    "latest",
    "package-installed manifests should record the registry tag",
  );
  assert.equal(
    initializedManifest.upgrade.model,
    "installed-instance",
    "init should record the installed-instance upgrade model",
  );
  assert.equal(
    readLock(gitTarget).files.some((file) => file.path === "AGENTS.md"),
    true,
    "init should lock installed managed files",
  );

  const doctor = quiet(() => runDoctor({ cwd: gitTarget }));
  assert.equal(doctor.ok, true, "doctor should pass after init");

  const dryRunCollision = quiet(() => runInit({
    cwd: root,
    args: ["--target", gitTarget, "--profile", "minimal", "--dry-run"],
  }));
  assert.equal(dryRunCollision.ok, true, "init --dry-run should report collisions without failing");
  assert.equal(dryRunCollision.collisions.length, 8, "dry-run should report planned file collisions");
  assert.equal(
    dryRunCollision.warnings.some((warning) => warning.includes("rerun with --force")),
    true,
    "init --dry-run should warn that --force can overwrite existing artifacts",
  );

  writeFileSync(join(gitTarget, "AGENTS.md"), "# Existing local process\n");
  const duplicate = quiet(() => runInit({
    cwd: root,
    args: ["--target", gitTarget, "--profile", "minimal"],
  }));
  assert.equal(duplicate.ok, false, "init should refuse to overwrite without --force");
  assert.equal(duplicate.collisions.includes("AGENTS.md"), true, "init should report colliding artifacts");
  assert.equal(
    duplicate.warnings.some((warning) => warning.includes("rerun with --force")),
    true,
    "init should warn that --force can definitively overwrite existing artifacts",
  );

  const forced = quiet(() => runInit({
    cwd: root,
    args: ["--target", gitTarget, "--profile", "minimal", "--force"],
  }));
  assert.equal(forced.ok, true, "init --force should overwrite and pass");
  assert.equal(forced.overwrites.includes("AGENTS.md"), true, "init --force should report overwritten artifacts");
  const forcedAgents = readFileSync(join(gitTarget, "AGENTS.md"), "utf8");
  assert.match(forcedAgents, /This repo has the portable harness installed/, "init --force should write harness instructions");
  assert.doesNotMatch(forcedAgents, /Existing local process/, "init --force should replace existing process text");

  const upgrade = quiet(() => runTestUpgrade({ cwd: gitTarget, args: ["--plan"] }));
  assert.equal(upgrade.ok, true, "upgrade --plan should pass after init");
  assert.equal(upgrade.plan.blockers.length, 0, "upgrade --plan should have no blockers after init");
  assert.equal(upgrade.plan.warnings.length, 0, "upgrade --plan should have no warnings after init");
  assert.equal(upgrade.plan.lock.status, "present", "upgrade --plan should report present lock state");
  assert.equal(upgrade.plan.plan_schema_version, 1, "upgrade plan should expose a schema version");
  assert.equal(
    upgrade.plan.operation_contract_version,
    2,
    "upgrade plan should expose an operation contract version",
  );
  assert.equal(upgrade.plan.version_source.type, "package", "upgrade plan should report package version source for initialized targets");
  assert.equal(
    upgrade.plan.version_source.install_model,
    "installed-instance",
    "upgrade plan should report installed-instance version-source model",
  );
  assert.equal(
    upgrade.plan.upgrade_guidance.model,
    "installed-instance",
    "upgrade plan should expose installed-instance guidance",
  );
  assert.equal(
    upgrade.plan.upgrade_guidance.tracking,
    "repo-local",
    "upgrade guidance should preserve repo-local tracking",
  );
  assert.equal(
    upgrade.plan.upgrade_guidance.current_instance.source_type,
    "package",
    "upgrade guidance should summarize the current package source",
  );
  assert.equal(
    upgrade.plan.upgrade_guidance.current_instance.registry_tag,
    "latest",
    "upgrade guidance should include the configured registry tag",
  );
  assert.match(
    upgrade.plan.upgrade_guidance.source_boundary,
    /does not track installed target repos/,
    "upgrade guidance should state the no-central-registry boundary",
  );
  assert.equal(
    upgrade.plan.upgrade_guidance.operator_workflow.length,
    3,
    "upgrade guidance should include the private per-repo operator workflow",
  );
  assert.equal(
    upgrade.plan.version_source.registry.status,
    "unpublished-or-private",
    "upgrade plan should report unpublished/private package registry status",
  );
  assert.equal(
    upgrade.plan.version_source.registry.version,
    null,
    "unpublished/private registry discovery should not report a version",
  );
  assert.equal(
    upgrade.plan.available_harness_version,
    "0.1.0",
    "unpublished/private registry discovery should fall back to executing package version",
  );
  const registryUpgrade = quiet(() => runTestUpgrade({
    cwd: gitTarget,
    args: ["--plan"],
    registryDiscovery: availableRegistry("0.2.0"),
  }));
  assert.equal(
    registryUpgrade.plan.version_source.registry.status,
    "available",
    "upgrade plan should report available registry versions",
  );
  assert.equal(
    registryUpgrade.plan.available_harness_version,
    "0.2.0",
    "available registry discovery should set the available harness version",
  );
  assert.match(
    registryUpgrade.plan.upgrade_guidance.next_operator_action,
    /0\.1\.0 -> 0\.2\.0/,
    "available registry version changes should be reflected in next operator action",
  );
  assert.equal(
    hasOperation(registryUpgrade.plan, "review/harness-version-change", "0.1.0 -> 0.2.0"),
    true,
    "available registry version changes should be review-required operations",
  );
  assert.equal(upgrade.plan.managed_files.length, 4, "upgrade plan should include managed file states");
  assert.equal(upgrade.plan.commands.length, 9, "upgrade plan should include command states");
  assert.equal(upgrade.plan.operation_summary.by_status.safe > 0, true, "upgrade plan should summarize safe operations");
  assert.equal(
    upgrade.plan.operation_summary.by_code["deferred/apply-not-implemented"],
    1,
    "upgrade plan should summarize deferred apply scaffolding",
  );
  assert.equal(
    hasOperation(upgrade.plan, "safe/noop", "AGENTS.md"),
    true,
    "upgrade plan should classify clean managed files as safe noop operations",
  );
  assert.equal(
    hasOperation(upgrade.plan, "deferred/apply-not-implemented", "harness upgrade apply"),
    true,
    "upgrade plan should classify apply behavior as deferred",
  );
  const apply = quiet(() => runTestUpgrade({ cwd: gitTarget, args: ["apply"] }));
  assert.equal(apply.ok, true, "upgrade apply should pass for safe/noop-only initialized targets");
  assert.equal(
    apply.apply.applied.some((item) => item.includes("safe/noop")),
    true,
    "upgrade apply should report satisfied noop operations",
  );
  const jsonPlan = JSON.parse(execFileSync(
    process.execPath,
    [join(REPO_ROOT, "scripts", "harness.mjs"), "upgrade", "--plan", "--json"],
    {
      cwd: gitTarget,
      encoding: "utf8",
      env: { ...process.env, HARNESS_REGISTRY_DISCOVERY: "skip" },
    },
  ));
  assert.equal(jsonPlan.plan_schema_version, 1, "upgrade --plan --json should emit parseable plan JSON");
  assert.equal(
    jsonPlan.version_source.registry.status,
    "skipped",
    "HARNESS_REGISTRY_DISCOVERY=skip should be reported in JSON upgrade plans",
  );
  assert.equal(
    jsonPlan.operation_summary.by_code["safe/noop"] > 0,
    true,
    "JSON upgrade plan should include operation summary counts",
  );
  assert.equal(
    jsonPlan.upgrade_guidance.current_instance.package,
    "portable-harness",
    "JSON upgrade plan should include installed-instance source package",
  );
  const availableDecisionModule = upgrade.plan.modules.find((module) => module.id === "decisions-open-questions");
  assert.equal(
    availableDecisionModule?.status,
    "available-not-installed",
    "upgrade plan should report installable registry modules that are absent",
  );
  assert.equal(
    hasOperation(upgrade.plan, "deferred/installable-module-available", "decisions-open-questions"),
    true,
    "upgrade plan should leave optional absent registry modules deferred",
  );

  const moduleList = quiet(() => runModules({ cwd: root, args: ["list", "--target", gitTarget] }));
  assert.equal(moduleList.ok, true, "modules list should pass against an initialized target");
  assert.equal(
    moduleList.modules.find((module) => module.id === "agent-operating-contract")?.installed,
    true,
    "modules list should report bootstrap modules as installed",
  );
  assert.equal(
    moduleList.modules.find((module) => module.id === "agent-operating-contract")?.installable,
    false,
    "modules list should report bootstrap modules as not standalone-installable",
  );
  assert.equal(
    moduleList.modules.find((module) => module.id === "decisions-open-questions")?.installed,
    false,
    "modules list should report decisions-open-questions as available before add",
  );
  assert.equal(
    moduleList.modules.find((module) => module.id === "decisions-open-questions")?.installable,
    true,
    "modules list should report decisions-open-questions as installable",
  );

  const profiles = quiet(() => runProfiles({ args: ["list"] }));
  assert.equal(profiles.ok, true, "profiles list should pass");
  assert.equal(profiles.profiles.length, 2, "profiles list should return source profiles");
  assert.deepEqual(
    profiles.profiles.find((profile) => profile.id === "minimal")?.modules,
    ["agent-operating-contract", "progressive-orientation"],
    "profiles list should expose minimal profile modules",
  );

  const sourceInspect = quiet(() => runProfiles({ cwd: root, args: ["inspect", "minimal"] }));
  assert.equal(sourceInspect.ok, true, "profiles inspect should pass without a target manifest");
  assert.equal(sourceInspect.target.inspected, false, "profiles inspect should be source-only without a target manifest");
  assert.equal(sourceInspect.summary.not_inspected, 2, "source-only inspect should not classify target state");

  const targetInspect = quiet(() => runProfiles({
    cwd: root,
    args: ["inspect", "dogfood", "--target", gitTarget],
  }));
  assert.equal(targetInspect.ok, true, "profiles inspect should pass against an initialized target");
  assert.equal(targetInspect.target.inspected, true, "profiles inspect should load explicit target manifests");
  assert.equal(targetInspect.target.profile, "minimal", "profiles inspect should report the target's active profile");
  assert.equal(targetInspect.summary.installed, 2, "minimal target should have two dogfood profile modules installed");
  assert.equal(targetInspect.summary.clean_install, 5, "dogfood inspect should identify five clean missing modules");
  assert.equal(
    targetInspect.modules.find((module) => module.id === "decisions-open-questions")?.target_status,
    "clean-install",
    "profiles inspect should classify clean missing target modules",
  );
  assert.equal(
    targetInspect.modules.find((module) => module.id === "agent-operating-contract")?.target_status,
    "installed",
    "profiles inspect should classify installed target modules",
  );

  const jsonInspect = JSON.parse(execFileSync(
    process.execPath,
    [join(REPO_ROOT, "scripts", "harness.mjs"), "profiles", "inspect", "dogfood", "--target", gitTarget, "--json"],
    { cwd: root, encoding: "utf8" },
  ));
  assert.equal(jsonInspect.profile.id, "dogfood", "profiles inspect --json should emit the inspected profile");
  assert.equal(jsonInspect.summary.clean_install, 5, "profiles inspect --json should emit target summary counts");

  const badInspect = quiet(() => runProfiles({ cwd: root, args: ["inspect", "unknown"] }));
  assert.equal(badInspect.ok, false, "profiles inspect should fail unsupported profiles");

  const missingTargetInspect = quiet(() => runProfiles({ cwd: root, args: ["inspect", "minimal", "--target"] }));
  assert.equal(missingTargetInspect.ok, false, "profiles inspect should fail when --target has no path");

  writeFileSync(join(gitTarget, "open-questions.yaml"), "# existing local file\n");
  const collisionInspect = quiet(() => runProfiles({
    cwd: root,
    args: ["inspect", "dogfood", "--target", gitTarget],
  }));
  assert.equal(
    collisionInspect.modules.find((module) => module.id === "decisions-open-questions")?.target_status,
    "review-required",
    "profiles inspect should classify module artifact collisions as review-required",
  );
  assert.equal(collisionInspect.summary.review_required, 1, "profiles inspect should summarize review-required modules");
  assertNotExists(gitTarget, "modules/decisions-open-questions/module.yaml");
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);

  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before profile-bounded upgrade apply");

  setManifestProfile(target, "dogfood");

  const plan = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(plan.ok, true, "upgrade --plan should pass for a clean missing profile module");
  assert.equal(plan.plan.blockers.length, 0, "clean profile module install plan should have no blockers");
  assert.equal(plan.plan.warnings.length, 0, "clean profile module install plan should have no warnings");
  assert.equal(
    plan.plan.modules.find((module) => module.id === "decisions-open-questions")?.status,
    "profile-module-missing",
    "upgrade plan should identify missing active-profile modules",
  );
  assert.equal(
    hasOperation(plan.plan, "safe/install-module", "decisions-open-questions"),
    true,
    "upgrade plan should classify clean missing profile modules as safe installs",
  );
  assert.equal(
    hasOperation(plan.plan, "safe/install-module", "plans-and-status"),
    true,
    "upgrade plan should classify every clean missing active-profile module as safe",
  );

  const apply = quiet(() => runTestUpgrade({ cwd: target, args: ["apply"] }));
  assert.equal(apply.ok, true, "upgrade apply should install clean missing profile modules");
  assert.equal(
    apply.apply.applied.some((item) => item.includes("safe/install-module: decisions-open-questions")),
    true,
    "upgrade apply should report installed profile modules",
  );
  assertExists(target, "modules/decisions-open-questions/module.yaml");
  assertExists(target, "open-questions.yaml");
  assertExists(target, "metadata/artifacts.yaml");
  assertExists(target, "state/canonical-state.yaml");
  assertExists(target, "invariants/golden-principles.yaml");
  assertExists(target, "plans/current.yaml");

  const after = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(after.ok, true, "upgrade --plan should pass after profile module installs");
  assert.equal(after.plan.blockers.length, 0, "post-install upgrade plan should have no blockers");
  assert.equal(after.plan.warnings.length, 0, "post-install upgrade plan should have no warnings");
  assert.equal(
    after.plan.modules.find((module) => module.id === "plans-and-status")?.status,
    "unchanged",
    "installed profile modules should become unchanged in the next plan",
  );

  const doctor = quiet(() => runDoctor({ cwd: target }));
  assert.equal(doctor.ok, true, "doctor should pass after profile-bounded module apply");
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);

  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before profile module collision test");

  setManifestProfile(target, "dogfood");
  writeFileSync(join(target, "open-questions.yaml"), "# existing local file\n");

  const plan = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(plan.ok, true, "upgrade --plan should return review operations for module collisions");
  assert.equal(
    plan.plan.warnings.some((item) => item.includes("profile module 'decisions-open-questions' needs review")),
    true,
    "upgrade plan should warn about profile module install collisions",
  );
  assert.equal(
    hasOperation(plan.plan, "review/install-module-collision", "decisions-open-questions"),
    true,
    "upgrade plan should classify module artifact collisions as review-required",
  );

  const apply = quiet(() => runTestUpgrade({ cwd: target, args: ["apply"] }));
  assert.equal(apply.ok, false, "upgrade apply should refuse module collision plans");
  assert.equal(
    apply.apply.errors.some((item) => item.includes("review/install-module-collision")),
    true,
    "upgrade apply should report the module collision review operation",
  );
  assertNotExists(target, "modules/structured-metadata/module.yaml");
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);

  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before structured metadata module add");

  const install = quiet(() => runModules({
    cwd: root,
    args: ["add", "structured-metadata", "--target", target],
  }));
  assert.equal(install.ok, true, "modules add should install structured-metadata");
  assertExists(target, "modules/structured-metadata/module.yaml");
  assertExists(target, "metadata/artifacts.yaml");

  const check = quiet(() => runMetadata({ cwd: target, args: ["check"] }));
  assert.equal(check.ok, true, "metadata check should pass after install");
  assert.equal(check.artifacts.length, 4, "metadata check should return installed template artifacts");

  const list = quiet(() => runMetadata({ cwd: target, args: ["list"] }));
  assert.equal(list.ok, true, "metadata list should pass after install");

  const tagged = quiet(() => runMetadata({ cwd: target, args: ["list", "--tag", "orientation"] }));
  assert.equal(tagged.artifacts.length, 3, "metadata list should filter artifacts by tag");

  const kind = quiet(() => runMetadata({ cwd: target, args: ["list", "--kind", "operating-contract"] }));
  assert.equal(kind.artifacts.length, 1, "metadata list should filter artifacts by kind");

  const report = quiet(() => runMetadata({ cwd: target, args: ["report"] }));
  assert.equal(report.ok, true, "metadata report should pass after install");
  assert.equal(report.summary.total, 4, "metadata report should summarize artifact count");
  assert.equal(report.summary.by_status.active, 4, "metadata report should summarize status counts");
  assert.equal(report.summary.by_tag.orientation, 3, "metadata report should summarize tag counts");

  const jsonList = JSON.parse(execFileSync(
    process.execPath,
    [join(REPO_ROOT, "scripts", "harness.mjs"), "metadata", "list", "--tag", "orientation", "--json"],
    { cwd: target, encoding: "utf8" },
  ));
  assert.equal(jsonList.artifacts.length, 3, "metadata list --json should emit filtered JSON");

  const jsonReport = JSON.parse(execFileSync(
    process.execPath,
    [join(REPO_ROOT, "scripts", "harness.mjs"), "metadata", "report", "--json"],
    { cwd: target, encoding: "utf8" },
  ));
  assert.equal(jsonReport.summary.total, 4, "metadata report --json should emit summary JSON");

  const doctor = quiet(() => runDoctor({ cwd: target }));
  assert.equal(doctor.ok, true, "doctor should validate structured metadata after install");
  assert.equal(
    doctor.diagnostics.ok.some((item) => item.includes("metadata/artifacts.yaml")),
    true,
    "doctor should report metadata validation",
  );

  const upgrade = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(upgrade.ok, true, "upgrade --plan should pass after structured metadata install");
  assert.equal(upgrade.plan.managed_files.length, 5, "structured metadata should add one managed file");
  assert.equal(upgrade.plan.commands.length, 12, "structured metadata should add three command records");
  assert.equal(
    upgrade.plan.modules.find((module) => module.id === "structured-metadata")?.status,
    "unchanged",
    "upgrade --plan should report structured metadata as installed",
  );

  writeFileSync(join(target, "metadata", "artifacts.yaml"), `metadata:
  version: 1
  artifacts:
    - id: missing
      path: missing.md
      kind: fixture
      status: active
`);
  const bad = quiet(() => runMetadata({ cwd: target, args: ["check"] }));
  assert.equal(bad.ok, false, "metadata check should fail missing active artifact paths");
  assert.equal(
    bad.errors.some((item) => item.includes("missing.md")),
    true,
    "metadata check should report missing active artifact paths",
  );

  writeFileSync(join(target, "metadata", "artifacts.yaml"), `metadata:
  version: 1
  artifacts:
    - id: agents
      path: AGENTS.md
      kind: operating-contract
      status: active
      depends_on:
        - missing
`);
  const badDependency = quiet(() => runMetadata({ cwd: target, args: ["check"] }));
  assert.equal(badDependency.ok, false, "metadata check should fail unknown dependencies");
  assert.equal(
    badDependency.errors.some((item) => item.includes("depends on unknown artifact 'missing'")),
    true,
    "metadata check should report unknown artifact dependencies",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);

  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before canonical-state module add");

  const metadataInstall = quiet(() => runModules({
    cwd: root,
    args: ["add", "structured-metadata", "--target", target],
  }));
  assert.equal(metadataInstall.ok, true, "modules add should install structured-metadata before canonical-state");

  const install = quiet(() => runModules({
    cwd: root,
    args: ["add", "canonical-state", "--target", target],
  }));
  assert.equal(install.ok, true, "modules add should install canonical-state");
  assertExists(target, "modules/canonical-state/module.yaml");
  assertExists(target, "state/canonical-state.yaml");

  const check = quiet(() => runState({ cwd: target, args: ["check"] }));
  assert.equal(check.ok, true, "state check should pass after install");
  assert.equal(check.entries.length, 4, "state check should return installed template entries");

  const jsonCheck = JSON.parse(execFileSync(
    process.execPath,
    [join(REPO_ROOT, "scripts", "harness.mjs"), "state", "check", "--json"],
    { cwd: target, encoding: "utf8" },
  ));
  assert.equal(jsonCheck.entries.length, 4, "state check --json should emit canonical state entries");

  const projectionEntries = quiet(() => runState({ cwd: target, args: ["list", "--role", "projection"] }));
  assert.equal(projectionEntries.entries.length, 2, "state list should filter entries by role");

  const ownerEntries = quiet(() => runState({
    cwd: target,
    args: ["list", "--owner-domain", "progressive-orientation"],
  }));
  assert.equal(ownerEntries.entries.length, 2, "state list should filter entries by owner domain");

  const activeEntries = quiet(() => runState({ cwd: target, args: ["list", "--status", "active"] }));
  assert.equal(activeEntries.entries.length, 4, "state list should filter entries by status");

  const report = quiet(() => runState({ cwd: target, args: ["report"] }));
  assert.equal(report.ok, true, "state report should pass after install");
  assert.equal(report.summary.total, 4, "state report should summarize entry count");
  assert.equal(report.summary.by_role.projection, 2, "state report should summarize role counts");
  assert.equal(report.summary.by_owner_domain["progressive-orientation"], 2, "state report should summarize owners");

  const jsonList = JSON.parse(execFileSync(
    process.execPath,
    [join(REPO_ROOT, "scripts", "harness.mjs"), "state", "list", "--role", "projection", "--json"],
    { cwd: target, encoding: "utf8" },
  ));
  assert.equal(jsonList.entries.length, 2, "state list --json should emit filtered entries");

  const jsonReport = JSON.parse(execFileSync(
    process.execPath,
    [join(REPO_ROOT, "scripts", "harness.mjs"), "state", "report", "--json"],
    { cwd: target, encoding: "utf8" },
  ));
  assert.equal(jsonReport.summary.by_role.source, 1, "state report --json should emit summary JSON");

  const doctor = quiet(() => runDoctor({ cwd: target }));
  assert.equal(doctor.ok, true, "doctor should validate canonical state after install");
  assert.equal(
    doctor.diagnostics.ok.some((item) => item.includes("state/canonical-state.yaml")),
    true,
    "doctor should report canonical state validation",
  );

  const upgrade = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(upgrade.ok, true, "upgrade --plan should pass after canonical-state install");
  assert.equal(upgrade.plan.managed_files.length, 6, "canonical-state should add one managed file");
  assert.equal(upgrade.plan.commands.length, 15, "canonical-state should add three command records");
  assert.equal(
    upgrade.plan.modules.find((module) => module.id === "canonical-state")?.status,
    "unchanged",
    "upgrade --plan should report canonical-state as installed",
  );

  writeFileSync(join(target, "state", "canonical-state.yaml"), `canonical_state:
  version: 1
  entries:
    - id: agents
      path: AGENTS.md
      metadata_id: missing
      state_role: source
      status: active
`);
  const badMetadataReference = quiet(() => runState({ cwd: target, args: ["check"] }));
  assert.equal(badMetadataReference.ok, false, "state check should fail unknown metadata references");
  assert.equal(
    badMetadataReference.errors.some((item) => item.includes("metadata_id 'missing' is unknown")),
    true,
    "state check should report unknown metadata references",
  );

  writeFileSync(join(target, "state", "canonical-state.yaml"), `canonical_state:
  version: 1
  entries:
    - id: agents
      path: AGENTS.md
      metadata_id: agents
      state_role: invalid
      status: active
`);
  const badRole = quiet(() => runState({ cwd: target, args: ["check"] }));
  assert.equal(badRole.ok, false, "state check should fail invalid state roles");
  assert.equal(
    badRole.errors.some((item) => item.includes("invalid state_role")),
    true,
    "state check should report invalid state roles",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);

  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before invariants module add");

  const stateInstall = quiet(() => runModules({
    cwd: root,
    args: ["add", "canonical-state", "--target", target],
  }));
  assert.equal(stateInstall.ok, true, "modules add should install canonical-state before invariants");

  const install = quiet(() => runModules({
    cwd: root,
    args: ["add", "invariants-golden-principles", "--target", target],
  }));
  assert.equal(install.ok, true, "modules add should install invariants-golden-principles");
  assertExists(target, "modules/invariants-golden-principles/module.yaml");
  assertExists(target, "invariants/golden-principles.yaml");

  const check = quiet(() => runInvariants({ cwd: target, args: ["check"] }));
  assert.equal(check.ok, true, "invariants check should pass after install");
  assert.equal(check.principles.length, 2, "invariants check should return installed template principles");
  assert.equal(check.check_results.length, 2, "invariants check should run installed template checks");

  const jsonCheck = JSON.parse(execFileSync(
    process.execPath,
    [join(REPO_ROOT, "scripts", "harness.mjs"), "invariants", "check", "--json"],
    { cwd: target, encoding: "utf8" },
  ));
  assert.equal(jsonCheck.principles.length, 2, "invariants check --json should emit principles");

  const doctor = quiet(() => runDoctor({ cwd: target }));
  assert.equal(doctor.ok, true, "doctor should validate invariants after install");
  assert.equal(
    doctor.diagnostics.ok.some((item) => item.includes("invariants/golden-principles.yaml")),
    true,
    "doctor should report invariants validation",
  );

  const upgrade = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(upgrade.ok, true, "upgrade --plan should pass after invariants install");
  assert.equal(upgrade.plan.managed_files.length, 6, "invariants should add one managed file");
  assert.equal(upgrade.plan.commands.length, 13, "invariants should add one command record");
  assert.equal(
    upgrade.plan.modules.find((module) => module.id === "invariants-golden-principles")?.status,
    "unchanged",
    "upgrade --plan should report invariants as installed",
  );

  writeFileSync(join(target, "invariants", "golden-principles.yaml"), `invariants:
  version: 1
  principles:
    - id: bad-canonical-reference
      title: Bad canonical reference
      status: active
      severity: error
      statement: Fixture.
      canonical_state_id: missing
      checks:
        - type: file_contains
          path: status.md
          text: not a changelog
`);
  const badReference = quiet(() => runInvariants({ cwd: target, args: ["check"] }));
  assert.equal(badReference.ok, false, "invariants check should fail unknown canonical state references");
  assert.equal(
    badReference.errors.some((item) => item.includes("canonical_state_id 'missing' is unknown")),
    true,
    "invariants check should report unknown canonical state references",
  );

  writeFileSync(join(target, "invariants", "golden-principles.yaml"), `invariants:
  version: 1
  principles:
    - id: missing-required-text
      title: Missing required text
      status: active
      severity: error
      statement: Fixture.
      checks:
        - type: file_contains
          path: status.md
          text: phrase that is absent
`);
  const badText = quiet(() => runInvariants({ cwd: target, args: ["check"] }));
  assert.equal(badText.ok, false, "invariants check should fail missing required text");
  assert.equal(
    badText.errors.some((item) => item.includes("does not contain required text")),
    true,
    "invariants check should report missing required text",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);

  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before plans-and-status module add");

  const stateInstall = quiet(() => runModules({
    cwd: root,
    args: ["add", "canonical-state", "--target", target],
  }));
  assert.equal(stateInstall.ok, true, "modules add should install canonical-state before plans");

  const install = quiet(() => runModules({
    cwd: root,
    args: ["add", "plans-and-status", "--target", target],
  }));
  assert.equal(install.ok, true, "modules add should install plans-and-status");
  assertExists(target, "modules/plans-and-status/module.yaml");
  assertExists(target, "plans/current.yaml");

  const check = quiet(() => runPlans({ cwd: target, args: ["check"] }));
  assert.equal(check.ok, true, "plans check should pass after install");
  assert.equal(check.plans.length, 1, "plans check should return installed template plans");

  const activePlans = quiet(() => runPlans({ cwd: target, args: ["list", "--status", "active"] }));
  assert.equal(activePlans.plans.length, 1, "plans list should filter by status");

  const report = quiet(() => runPlans({ cwd: target, args: ["report"] }));
  assert.equal(report.ok, true, "plans report should pass after install");
  assert.equal(report.summary.total, 1, "plans report should summarize plan count");
  assert.equal(report.summary.by_status.active, 1, "plans report should summarize active plans");

  const jsonReport = JSON.parse(execFileSync(
    process.execPath,
    [join(REPO_ROOT, "scripts", "harness.mjs"), "plans", "report", "--json"],
    { cwd: target, encoding: "utf8" },
  ));
  assert.equal(jsonReport.summary.total, 1, "plans report --json should emit summary JSON");

  const doctor = quiet(() => runDoctor({ cwd: target }));
  assert.equal(doctor.ok, true, "doctor should validate plans after install");
  assert.equal(
    doctor.diagnostics.ok.some((item) => item.includes("plans/current.yaml")),
    true,
    "doctor should report plans validation",
  );

  const upgrade = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(upgrade.ok, true, "upgrade --plan should pass after plans install");
  assert.equal(upgrade.plan.managed_files.length, 6, "plans should add one managed file");
  assert.equal(upgrade.plan.commands.length, 15, "plans should add three command records");
  assert.equal(
    upgrade.plan.modules.find((module) => module.id === "plans-and-status")?.status,
    "unchanged",
    "upgrade --plan should report plans-and-status as installed",
  );

  writeFileSync(join(target, "plans", "current.yaml"), `plans_status:
  version: 1
  status_projection: status.md
  plans:
    - id: bad-status
      title: Bad status
      status: invalid
      summary: Fixture.
`);
  const badStatus = quiet(() => runPlans({ cwd: target, args: ["check"] }));
  assert.equal(badStatus.ok, false, "plans check should fail invalid statuses");
  assert.equal(
    badStatus.errors.some((item) => item.includes("invalid status")),
    true,
    "plans check should report invalid statuses",
  );

  writeFileSync(join(target, "plans", "current.yaml"), `plans_status:
  version: 1
  status_projection: status.md
  plans:
    - id: missing-reference
      title: Missing reference
      status: active
      priority: high
      summary: Fixture.
      next_action: Fix the missing reference.
      references:
        - missing.md
`);
  const badReference = quiet(() => runPlans({ cwd: target, args: ["check"] }));
  assert.equal(badReference.ok, false, "plans check should fail missing references");
  assert.equal(
    badReference.errors.some((item) => item.includes("reference 'missing.md' is missing")),
    true,
    "plans check should report missing references",
  );
});

withTempDir((root) => {
  const bad = quiet(() => runInit({ cwd: root, args: ["--profile", "unknown", "--allow-non-git"] }));
  assert.equal(bad.ok, false, "unsupported profile should fail");
});

withTempDir((root) => {
  const target = join(root, "dogfood-target");
  initGitRepo(target);

  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "dogfood"],
  }));
  assert.equal(init.ok, true, "dogfood profile init should pass in a git repo");

  for (const file of [
    "AGENTS.md",
    "status.md",
    "index.yaml",
    "state/CONTEXT.md",
    ".harness/manifest.yaml",
    ".harness/lock.yaml",
    "modules/agent-operating-contract/module.yaml",
    "modules/progressive-orientation/module.yaml",
    "modules/decisions-open-questions/module.yaml",
    "modules/structured-metadata/module.yaml",
    "modules/canonical-state/module.yaml",
    "modules/invariants-golden-principles/module.yaml",
    "modules/plans-and-status/module.yaml",
    "open-questions.yaml",
    "metadata/artifacts.yaml",
    "state/canonical-state.yaml",
    "invariants/golden-principles.yaml",
    "plans/current.yaml",
    "templates/decision.md",
  ]) {
    assertExists(target, file);
  }

  assert.match(
    readFileSync(join(target, ".harness", "manifest.yaml"), "utf8"),
    /profile: dogfood/,
    "dogfood profile init should record the installed profile",
  );

  const doctor = quiet(() => runDoctor({ cwd: target }));
  assert.equal(doctor.ok, true, "doctor should pass after dogfood profile init");

  const moduleList = quiet(() => runModules({ cwd: root, args: ["list", "--target", target] }));
  assert.equal(
    moduleList.modules.find((module) => module.id === "decisions-open-questions")?.installed,
    true,
    "dogfood profile init should install decisions-open-questions",
  );
  assert.equal(
    moduleList.modules.find((module) => module.id === "structured-metadata")?.installed,
    true,
    "dogfood profile init should install structured-metadata",
  );
  assert.equal(
    moduleList.modules.find((module) => module.id === "canonical-state")?.installed,
    true,
    "dogfood profile init should install canonical-state",
  );
  assert.equal(
    moduleList.modules.find((module) => module.id === "invariants-golden-principles")?.installed,
    true,
    "dogfood profile init should install invariants-golden-principles",
  );
  assert.equal(
    moduleList.modules.find((module) => module.id === "plans-and-status")?.installed,
    true,
    "dogfood profile init should install plans-and-status",
  );

  const metadata = quiet(() => runMetadata({ cwd: target, args: ["check"] }));
  assert.equal(metadata.ok, true, "dogfood profile init should install valid metadata");
  const metadataReport = quiet(() => runMetadata({ cwd: target, args: ["report"] }));
  assert.equal(metadataReport.summary.total, 4, "dogfood profile init should support metadata report");
  const state = quiet(() => runState({ cwd: target, args: ["check"] }));
  assert.equal(state.ok, true, "dogfood profile init should install valid canonical state");
  const stateReport = quiet(() => runState({ cwd: target, args: ["report"] }));
  assert.equal(stateReport.summary.total, 4, "dogfood profile init should support state report");
  const invariants = quiet(() => runInvariants({ cwd: target, args: ["check"] }));
  assert.equal(invariants.ok, true, "dogfood profile init should install valid invariants");
  const plans = quiet(() => runPlans({ cwd: target, args: ["check"] }));
  assert.equal(plans.ok, true, "dogfood profile init should install valid plans");
  const plansReport = quiet(() => runPlans({ cwd: target, args: ["report"] }));
  assert.equal(plansReport.summary.total, 1, "dogfood profile init should support plans report");

  const upgrade = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(upgrade.ok, true, "upgrade --plan should pass after dogfood profile init");
  assert.equal(upgrade.plan.blockers.length, 0, "dogfood profile upgrade plan should have no blockers");
  assert.equal(upgrade.plan.warnings.length, 0, "dogfood profile upgrade plan should have no warnings");
});

{
  const check = quiet(() => runDistribution({ args: ["check"] }));
  assert.equal(check.ok, true, "distribution check should validate package contents");
  assert.equal(check.files.includes("scripts/harness.mjs"), true, "distribution package should include the harness binary");
  assert.equal(check.files.includes("scripts/test.mjs"), false, "distribution package should exclude repo-local tests");
  assert.equal(check.files.includes("status.md"), false, "distribution package should exclude dogfood status");
  assert.equal(check.errors.length, 0, "distribution check should not report package boundary errors");

  const release = quiet(() => runDistribution({ args: ["release", "--plan"] }));
  assert.equal(release.ok, true, "distribution release plan should run");
  assert.equal(release.ready, false, "distribution release plan should stay blocked while package is private");
  assert.equal(release.access, "public", "distribution release plan should record public npm access policy");
  assert.equal(release.publish_dry_run.ok, true, "distribution release plan should run npm publish dry-run");
  assert.equal(
    release.blockers.includes("package.json private is true; registry publication is intentionally blocked"),
    true,
    "distribution release plan should block registry publication while package is private",
  );
  assert.equal(
    release.blockers.includes("package.json license is UNLICENSED; public registry publication requires a release license decision"),
    true,
    "distribution release plan should block public registry publication while license is UNLICENSED",
  );

  const publishPlan = quiet(() => runDistribution({ args: ["publish", "--plan"] }));
  assert.equal(publishPlan.ok, true, "distribution publish plan should run");
  assert.equal(publishPlan.ready, false, "distribution publish plan should stay blocked while release plan is blocked");
  assert.equal(publishPlan.published, false, "distribution publish plan should not publish");
  assert.equal(publishPlan.access, "public", "distribution publish plan should record public npm access policy");
  assert.equal(
    publishPlan.blockers.includes("package.json private is true; registry publication is intentionally blocked"),
    true,
    "distribution publish plan should carry release blockers",
  );

  const publishConfirm = quiet(() => runDistribution({ args: ["publish", "--confirm"] }));
  assert.equal(publishConfirm.ok, false, "distribution publish confirm should refuse blocked release plans");
  assert.equal(publishConfirm.published, false, "blocked distribution publish confirm should not publish");
  assert.equal(
    publishConfirm.blockers.includes("package.json private is true; registry publication is intentionally blocked"),
    true,
    "distribution publish confirm should report release blockers",
  );

  const smoke = quiet(() => withRegistryDiscoverySkip(() =>
    runDistribution({ args: ["smoke", "--profile", "minimal"] }),
  ));
  assert.equal(smoke.ok, true, "distribution smoke should pass for the minimal profile");
  assert.equal(smoke.package_check.ok, true, "distribution smoke should validate package contents before install");
  assert.equal(smoke.profiles.length, 1, "distribution smoke should run the requested profile");
  assert.equal(smoke.profiles[0].version_source.type, "package", "package-installed upgrade plan should report package version source");
  assert.equal(
    smoke.profiles[0].version_source.registry.status,
    "skipped",
    "test distribution smoke should report skipped registry discovery",
  );
  assert.equal(
    smoke.profiles[0].upgrade_guidance.model,
    "installed-instance",
    "distribution smoke should validate installed-instance upgrade guidance",
  );
  assert.equal(smoke.profiles[0].managed_files, 4, "minimal distribution smoke should validate managed files");
}

withTempDir((root) => {
  const externalTarget = join(root, "external-target");
  initGitRepo(externalTarget);
  const existingAgents = "# Existing Agent Instructions\n";
  writeFileSync(join(externalTarget, "AGENTS.md"), existingAgents);
  writeFileSync(join(externalTarget, "README.md"), "# External Target\n");

  const smoke = quiet(() => withRegistryDiscoverySkip(() =>
    runDistribution({ args: ["smoke", "--profile", "minimal", "--target", externalTarget, "--force"] }),
  ));
  assert.equal(smoke.ok, true, "external target distribution smoke should pass");
  assert.equal(smoke.force_init, true, "external target distribution smoke should report forced init");
  assert.equal(smoke.external_targets[0], externalTarget, "external smoke should report source target path");
  assert.equal(smoke.profiles.length, 1, "external smoke should run the requested profile");
  assert.equal(smoke.profiles[0].target_source, externalTarget, "external smoke should report profile target source");
  assert.equal(smoke.profiles[0].force_init, true, "external smoke profile should report forced init");
  assert.equal(smoke.profiles[0].version_source.type, "package", "external smoke should use package version source");
  assert.equal(
    smoke.profiles[0].version_source.registry.status,
    "skipped",
    "external smoke should report skipped registry discovery in tests",
  );
  assert.equal(
    smoke.profiles[0].upgrade_guidance.current_instance.source_type,
    "package",
    "external smoke should report installed-instance source guidance",
  );
  assert.equal(
    readFileSync(join(externalTarget, "AGENTS.md"), "utf8"),
    existingAgents,
    "external smoke should not mutate existing source target agent instructions",
  );
  assert.equal(
    existsSync(join(externalTarget, "package.json")),
    false,
    "external smoke should not write package metadata into the source target",
  );

  const missingTarget = quiet(() => withRegistryDiscoverySkip(() =>
    runDistribution({ args: ["smoke", "--target", join(root, "missing-target")] }),
  ));
  assert.equal(missingTarget.ok, false, "external smoke should fail for a missing target");
  assert.equal(
    missingTarget.errors.some((error) => error.includes("target does not exist")),
    true,
    "external smoke should explain missing target failures",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);

  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before module add");

  const install = quiet(() => runModules({
    cwd: root,
    args: ["add", "decisions-open-questions", "--target", target],
  }));
  assert.equal(install.ok, true, "modules add should install decisions-open-questions");
  assert.equal(install.installed, true, "modules add should report an install");
  assertExists(target, "modules/decisions-open-questions/module.yaml");
  assertExists(target, "decisions");
  assertExists(target, "open-questions.yaml");
  assertExists(target, "templates/decision.md");
  assert.match(
    readFileSync(join(target, ".harness", "manifest.yaml"), "utf8"),
    /decisions-open-questions/,
    "modules add should update the target manifest",
  );
  const lock = readLock(target);
  const openQuestionsLock = lock.files.find((file) => file.path === "open-questions.yaml");
  assert.equal(Boolean(openQuestionsLock), true, "modules add should add installed artifacts to the lock");
  assert.equal(openQuestionsLock.source, "module-template", "modules add should record template source kind");
  assert.equal(openQuestionsLock.source_kind, "module-template", "modules add should record semantic source kind");
  assert.equal(openQuestionsLock.artifact_role, "managed-file", "modules add should record artifact role");
  assert.equal(openQuestionsLock.owner_type, "module", "modules add should record owner type");
  assert.equal(openQuestionsLock.module_id, "decisions-open-questions", "modules add should record module id");
  assert.equal(openQuestionsLock.merge_strategy, "merge", "modules add should record merge strategy");
  assert.equal(
    openQuestionsLock.source_path,
    "modules/decisions-open-questions/templates/open-questions.yaml",
    "modules add should record template source path",
  );
  assert.equal(
    /^[a-f0-9]{64}$/.test(openQuestionsLock.source_sha256),
    true,
    "modules add should record template source fingerprint",
  );
  assert.equal(
    lock.files.some((file) => file.path === ".harness/manifest.yaml"),
    true,
    "modules add should refresh the manifest lock entry",
  );
  assert.equal(
    lock.files.find((file) => file.path === ".harness/manifest.yaml")?.artifact_role,
    "installed-manifest",
    "lock should record manifest artifact role",
  );

  const doctor = quiet(() => runDoctor({ cwd: target }));
  assert.equal(doctor.ok, true, "doctor should pass after module add");

  const moduleList = quiet(() => runModules({ cwd: root, args: ["list", "--target", target] }));
  assert.equal(
    moduleList.modules.find((module) => module.id === "decisions-open-questions")?.installed,
    true,
    "modules list should report the added module as installed",
  );

  const upgrade = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(upgrade.ok, true, "upgrade --plan should pass after module add");
  assert.equal(upgrade.plan.blockers.length, 0, "upgrade --plan should have no blockers after module add");
  assert.equal(upgrade.plan.warnings.length, 0, "upgrade --plan should have no warnings after module add");
  assert.equal(upgrade.plan.managed_files.length, 6, "module add should extend managed-file state");
  assert.equal(upgrade.plan.commands.length, 12, "module add should extend command state");
  assert.equal(
    upgrade.plan.modules.find((module) => module.id === "decisions-open-questions")?.status,
    "unchanged",
    "upgrade --plan should report the added module as installed",
  );

  const duplicate = quiet(() => runModules({
    cwd: root,
    args: ["add", "decisions-open-questions", "--target", target],
  }));
  assert.equal(duplicate.ok, true, "adding an installed module should no-op");
  assert.equal(duplicate.noop, true, "duplicate module add should report noop");
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);

  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before module collision test");

  writeFileSync(join(target, "open-questions.yaml"), "# existing local file\n");
  const blocked = quiet(() => runModules({
    cwd: root,
    args: ["add", "decisions-open-questions", "--target", target],
  }));
  assert.equal(blocked.ok, false, "modules add should block existing file collisions");
  assert.equal(
    blocked.errors.some((item) => item.includes("open-questions.yaml: already exists")),
    true,
    "modules add should report the colliding file",
  );
  assertNotExists(target, "modules/decisions-open-questions/module.yaml");

  const forced = quiet(() => runModules({
    cwd: root,
    args: ["add", "decisions-open-questions", "--target", target, "--force"],
  }));
  assert.equal(forced.ok, true, "modules add --force should install through collisions");
  assert.match(
    readFileSync(join(target, "open-questions.yaml"), "utf8"),
    /Harness managed file: decisions-open-questions/,
    "modules add --force should write the managed template",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);

  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before module error tests");

  const missing = quiet(() => runModules({
    cwd: root,
    args: ["add", "missing-module", "--target", target],
  }));
  assert.equal(missing.ok, false, "unknown module should fail");
  assert.equal(
    missing.errors.some((item) => item.includes("unknown module 'missing-module'")),
    true,
    "unknown module should report the missing registry entry",
  );

  const bootstrapNoop = quiet(() => runModules({
    cwd: root,
    args: ["add", "agent-operating-contract", "--target", target],
  }));
  assert.equal(bootstrapNoop.ok, true, "adding an already installed bootstrap module should no-op");
  assert.equal(bootstrapNoop.noop, true, "installed bootstrap module add should report noop");

  const brokenSource = createMissingArtifactSource(root);
  const broken = quiet(() => runModules({
    cwd: root,
    args: ["add", "broken-module", "--target", target],
    sourceRoot: brokenSource,
  }));
  assert.equal(broken.ok, false, "modules add should fail on missing source artifacts");
  assert.equal(
    broken.errors.some((item) => item.includes("source template missing")),
    true,
    "missing artifact should be reported before writes",
  );
  assertNotExists(target, "modules/broken-module/module.yaml");
});

withTempDir((root) => {
  const first = quiet(() => runDecisions({
    cwd: root,
    args: ["new", "Adopt test decision command"],
  }));
  assert.equal(first.ok, true, "first decision should be created");
  assertExists(root, "decisions/0001-adopt-test-decision-command.md");

  const second = quiet(() => runDecisions({
    cwd: root,
    args: ["new", "--status", "accepted", "Add another decision: with colon"],
  }));
  assert.equal(second.ok, true, "second decision should be created");
  assertExists(root, "decisions/0002-add-another-decision-with-colon.md");
  assert.match(
    readFileSync(join(root, "decisions/0002-add-another-decision-with-colon.md"), "utf8"),
    /status: accepted/,
    "decision --status should set initial status",
  );

  const list = quiet(() => runDecisions({ cwd: root, args: ["list"] }));
  assert.equal(list.ok, true, "decisions list should pass");
  assert.equal(list.decisions.length, 2, "decisions list should return created decisions");

  const badStatus = quiet(() => runDecisions({
    cwd: root,
    args: ["new", "--status", "blocked", "Invalid status"],
  }));
  assert.equal(badStatus.ok, false, "unsupported decision status should fail");

  const missingTitle = quiet(() => runDecisions({ cwd: root, args: ["new"] }));
  assert.equal(missingTitle.ok, false, "missing decision title should fail");
});

withTempDir((root) => {
  writeFileSync(join(root, "open-questions.yaml"), readFixture("good-open-questions.yaml"));
  const questions = quiet(() => runQuestions({ cwd: root, args: ["list"] }));
  assert.equal(questions.ok, true, "questions list should pass");
  assert.equal(questions.questions.length, 1, "questions list should return fixture questions");
});

withTempDir((root) => {
  const upgrade = quiet(() => runTestUpgrade({ cwd: root, args: ["--plan"] }));
  assert.equal(upgrade.ok, false, "upgrade --plan should fail without a manifest");
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);
  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before upgrade blocker mutation");

  unlinkSync(join(target, "status.md"));
  const missingFilePlan = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(missingFilePlan.ok, true, "upgrade --plan should still return a plan with blockers");
  assert.equal(
    missingFilePlan.plan.blockers.some((item) => item.includes("managed file 'status.md' is missing")),
    true,
    "upgrade --plan should report missing managed file blockers",
  );
  assert.equal(
    hasOperation(missingFilePlan.plan, "blocked/missing-managed-file", "status.md"),
    true,
    "upgrade --plan should classify missing managed files as blocked operations",
  );
  const missingApply = quiet(() => runTestUpgrade({ cwd: target, args: ["apply"] }));
  assert.equal(missingApply.ok, false, "upgrade apply should refuse blocked plans");
  assert.equal(
    missingApply.apply.errors.some((item) => item.includes("blocked/missing-managed-file")),
    true,
    "upgrade apply should report the blocked operation",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);
  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before upgrade warning mutation");

  writeFileSync(join(target, "AGENTS.md"), "# Custom Agent Instructions\n");
  const driftPlan = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(driftPlan.ok, true, "upgrade --plan should return a plan with warnings");
  assert.equal(
    driftPlan.plan.warnings.some((item) => item.includes("managed file 'AGENTS.md' differs from lock fingerprint")),
    true,
    "upgrade --plan should report lock drift warnings",
  );
  assert.equal(
    hasOperation(driftPlan.plan, "review/modified-managed-file", "AGENTS.md"),
    true,
    "upgrade --plan should classify modified managed files as review operations",
  );
  const driftApply = quiet(() => runTestUpgrade({ cwd: target, args: ["apply"] }));
  assert.equal(driftApply.ok, false, "upgrade apply should refuse review-required plans");
  assert.equal(
    driftApply.apply.errors.some((item) => item.includes("review/modified-managed-file")),
    true,
    "upgrade apply should report review-required operations",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);
  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before unlocked managed-file test");

  const lock = readLock(target);
  lock.files = lock.files.filter((file) => file.path !== "AGENTS.md");
  writeLock(target, lock);

  const unlockedPlan = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(unlockedPlan.ok, true, "upgrade --plan should return a plan with unlocked-file warnings");
  assert.equal(
    hasOperation(unlockedPlan.plan, "review/unlocked-managed-file", "AGENTS.md"),
    true,
    "upgrade --plan should classify unlocked managed files as review operations",
  );
  assert.equal(
    hasOperation(unlockedPlan.plan, "safe/refresh-lock", "AGENTS.md"),
    true,
    "upgrade --plan should classify lock refresh as a safe follow-up after review",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);
  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before lock command tests");

  const clean = quiet(() => runLock({ cwd: root, args: ["check", "--target", target] }));
  assert.equal(clean.ok, true, "lock check should pass after init");

  writeFileSync(join(target, "AGENTS.md"), "# Custom Agent Instructions\n");
  const drift = quiet(() => runLock({ cwd: root, args: ["check", "--target", target] }));
  assert.equal(drift.ok, false, "lock check should fail after managed-file drift");
  assert.equal(
    drift.drift.some((item) => item.includes("AGENTS.md")),
    true,
    "lock check should report the drifted file",
  );

  const refresh = quiet(() => runLock({ cwd: root, args: ["refresh", "--target", target] }));
  assert.equal(refresh.ok, true, "lock refresh should update the lock after intentional changes");

  const refreshed = quiet(() => runLock({ cwd: root, args: ["check", "--target", target] }));
  assert.equal(refreshed.ok, true, "lock check should pass after refresh");
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);
  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before lock refresh missing-file test");

  unlinkSync(join(target, "status.md"));
  const refresh = quiet(() => runLock({ cwd: root, args: ["refresh", "--target", target] }));
  assert.equal(refresh.ok, false, "lock refresh should refuse missing expected files");
  assert.equal(
    refresh.errors.some((item) => item.includes("status.md")),
    true,
    "lock refresh should report the missing expected file",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);
  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before legacy no-lock test");

  unlinkSync(join(target, ".harness", "lock.yaml"));
  const legacyPlan = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(legacyPlan.ok, true, "upgrade --plan should return a plan without a lock");
  assert.equal(
    legacyPlan.plan.warnings.some((item) => item.includes(".harness/lock.yaml is missing")),
    true,
    "upgrade --plan should warn when lock provenance is missing",
  );
  assert.equal(
    hasOperation(legacyPlan.plan, "review/missing-lock", ".harness/lock.yaml"),
    true,
    "upgrade --plan should classify missing locks as review operations",
  );
  assert.equal(
    hasOperation(legacyPlan.plan, "safe/refresh-lock", ".harness/lock.yaml"),
    true,
    "upgrade --plan should classify lock refresh as the safe follow-up operation",
  );

  const legacyDoctor = quiet(() => runDoctor({ cwd: target }));
  assert.equal(legacyDoctor.ok, true, "doctor should tolerate legacy missing-lock targets");
  assert.equal(
    legacyDoctor.diagnostics.warnings.some((item) => item.includes(".harness/lock.yaml: missing")),
    true,
    "doctor should warn when lock provenance is missing",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);
  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before command blocker mutation");

  const manifestPath = join(target, ".harness", "manifest.yaml");
  const manifest = readFileSync(manifestPath, "utf8").replace(
    "    doctor: harness doctor\n",
    "    doctor: npm run missing-doctor\n",
  );
  writeFileSync(manifestPath, manifest);

  const commandPlan = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(commandPlan.ok, true, "upgrade --plan should return a plan with command blockers");
  assert.equal(
    commandPlan.plan.blockers.some((item) => item.includes("command 'doctor' is not runnable")),
    true,
    "upgrade --plan should report command blockers",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  initGitRepo(target);
  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal"],
  }));
  assert.equal(init.ok, true, "init should pass before command repair mutation");

  mkdirSync(join(target, "scripts"), { recursive: true });
  writeFileSync(join(target, "scripts", "harness.mjs"), "#!/usr/bin/env node\n");
  writeFileSync(join(target, "package.json"), `${JSON.stringify({
    name: "repair-target",
    type: "module",
    scripts: {},
  }, null, 2)}\n`);

  const manifestPath = join(target, ".harness", "manifest.yaml");
  const manifest = readFileSync(manifestPath, "utf8").replace(
    "    doctor: harness doctor\n",
    "    doctor: npm run doctor\n",
  );
  writeFileSync(manifestPath, manifest);

  const repairPlan = quiet(() => runTestUpgrade({ cwd: target, args: ["--plan"] }));
  assert.equal(repairPlan.ok, true, "upgrade --plan should return a plan with repairable commands");
  assert.equal(repairPlan.plan.blockers.length, 0, "repairable commands should not be blockers");
  assert.equal(
    hasOperation(repairPlan.plan, "safe/repair-command", "doctor"),
    true,
    "upgrade --plan should classify deterministic command repairs as safe",
  );

  const repairApply = quiet(() => runTestUpgrade({ cwd: target, args: ["apply"] }));
  assert.equal(repairApply.ok, true, "upgrade apply should apply safe command repairs");
  assert.equal(
    repairApply.apply.applied.some((item) => item.includes("safe/repair-command")),
    true,
    "upgrade apply should report command repairs",
  );
  assert.equal(
    JSON.parse(readFileSync(join(target, "package.json"), "utf8")).scripts.doctor,
    "node scripts/harness.mjs doctor",
    "upgrade apply should restore the expected package script",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal", "--allow-non-git"],
  }));
  assert.equal(init.ok, true, "init should pass before doctor fixture mutation");

  addDecisionsModule(target, {
    openQuestions: "bad-open-questions.yaml",
    decision: "good-decision.md",
  });
  const badQuestions = quiet(() => runDoctor({ cwd: target }));
  assert.equal(badQuestions.ok, false, "doctor should reject invalid open question status");
  assert.equal(
    badQuestions.diagnostics.errors.some((item) => item.includes("invalid status 'blocked'")),
    true,
    "doctor should report invalid open question status",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal", "--allow-non-git"],
  }));
  assert.equal(init.ok, true, "init should pass before doctor fixture mutation");

  addDecisionsModule(target, {
    openQuestions: "good-open-questions.yaml",
    decision: "bad-decision-id.md",
  });
  const badDecision = quiet(() => runDoctor({ cwd: target }));
  assert.equal(badDecision.ok, false, "doctor should reject decision id mismatch");
  assert.equal(
    badDecision.diagnostics.errors.some((item) => item.includes("does not match filename id")),
    true,
    "doctor should report decision id mismatch",
  );
});

withTempDir((root) => {
  const target = join(root, "target");
  const init = quiet(() => runInit({
    cwd: root,
    args: ["--target", target, "--profile", "minimal", "--allow-non-git"],
  }));
  assert.equal(init.ok, true, "init should pass before depth-gate fixture mutation");

  mkdirSync(join(target, "build"), { recursive: true });
  writeFileSync(
    join(target, "build", "depth-gate.yaml"),
    `build_strategy:
  version: 1
  status: active
  scope: harness-repo-local
  strategy_doc: AGENTS.md
  portable_process_domain: true
  enforcement:
    - fixture
  completed_depth_passes: []
  current_depth_pass:
    id: fixture
    breadth_unit: fixture
    ready_for_next_breadth: true
    depth_criteria:
      - id: fixture
        status: partial
        evidence:
          - fixture
`,
  );

  const badGate = quiet(() => runDoctor({ cwd: target }));
  assert.equal(badGate.ok, false, "doctor should reject invalid depth-gate state");
  assert.equal(
    badGate.diagnostics.errors.some((item) => item.includes("portable_process_domain must be false")),
    true,
    "doctor should report depth-gate portability error",
  );
});

console.log("Harness tests: ok");
