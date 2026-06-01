import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { expectedLockPaths, hashFile, lockFileMap, readLock } from "./lock.mjs";
import { validateMetadata } from "./metadata.mjs";
import { validateCanonicalState } from "./state.mjs";
import { validateInvariants } from "./invariants.mjs";
import { validatePlansStatus } from "./plans.mjs";
import { validateCapture } from "./capture.mjs";
import { validateLegibility } from "./legibility.mjs";
import { validateReports } from "./reports.mjs";
import { validateMemory } from "./memory.mjs";

const VALID_MANAGED_FILE_MODES = new Set(["create", "merge", "replace", "observe"]);
const VALID_DECISION_STATUSES = new Set(["proposed", "accepted", "superseded", "reversed"]);
const VALID_OPEN_QUESTION_STATUSES = new Set(["open", "in_progress", "resolved", "deferred"]);
const VALID_DEPTH_STATUSES = new Set(["pending", "partial", "satisfied", "deferred"]);
const VALID_LOCK_ARTIFACT_ROLES = new Set([
  "generated-file",
  "installed-manifest",
  "managed-file",
  "module-artifact",
  "module-definition",
]);
const VALID_LOCK_OWNER_TYPES = new Set(["harness-lifecycle", "module"]);
const VALID_SHA256 = /^[a-f0-9]{64}$/;

function rel(root, file) {
  return join(root, file);
}

function createDiagnostics() {
  return {
    ok: [],
    warnings: [],
    errors: [],
    hints: [],
    _seen: {
      ok: new Set(),
      warnings: new Set(),
      errors: new Set(),
      hints: new Set(),
    },
  };
}

function addDiagnostic(diagnostics, type, message) {
  const seen = diagnostics._seen[type];
  if (seen.has(message)) return;
  seen.add(message);
  diagnostics[type].push(message);
}

function ok(diagnostics, message) {
  addDiagnostic(diagnostics, "ok", message);
}

function warn(diagnostics, message) {
  addDiagnostic(diagnostics, "warnings", message);
}

function error(diagnostics, message) {
  addDiagnostic(diagnostics, "errors", message);
}

function hint(diagnostics, message) {
  addDiagnostic(diagnostics, "hints", message);
}

function publicDiagnostics(diagnostics) {
  return {
    ok: diagnostics.ok,
    warnings: diagnostics.warnings,
    errors: diagnostics.errors,
    hints: diagnostics.hints,
  };
}

function missingFileHint(file, diagnostics) {
  if (file === ".harness/manifest.yaml") {
    hint(diagnostics, "Install the harness with `harness init` or restore the manifest.");
    return;
  }

  hint(
    diagnostics,
    `Restore missing managed/orientation files, or re-run merge-safe init after reviewing local changes.`,
  );
}

function readText(root, file, diagnostics) {
  const path = rel(root, file);
  if (!existsSync(path)) {
    error(diagnostics, `${file}: missing`);
    missingFileHint(file, diagnostics);
    return null;
  }
  return readFileSync(path, "utf8");
}

function readYaml(root, file, diagnostics) {
  const text = readText(root, file, diagnostics);
  if (text == null) return null;

  try {
    return parseYaml(text);
  } catch (parseError) {
    error(diagnostics, `${file}: YAML parse error: ${parseError.message}`);
    hint(diagnostics, `Fix YAML syntax in ${file}, then rerun harness doctor.`);
    return null;
  }
}

function readJson(root, file, diagnostics) {
  const text = readText(root, file, diagnostics);
  if (text == null) return null;

  try {
    return JSON.parse(text);
  } catch (parseError) {
    error(diagnostics, `${file}: JSON parse error: ${parseError.message}`);
    hint(diagnostics, `Fix JSON syntax in ${file}, then rerun harness doctor.`);
    return null;
  }
}

function parseFrontmatter(text, file, diagnostics) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    error(diagnostics, `${file}: missing YAML frontmatter`);
    return null;
  }

  try {
    return parseYaml(match[1]);
  } catch (parseError) {
    error(diagnostics, `${file}: frontmatter YAML parse error: ${parseError.message}`);
    hint(diagnostics, `Fix YAML frontmatter in ${file}, then rerun harness doctor.`);
    return null;
  }
}

function assertFile(root, file, diagnostics) {
  if (!existsSync(rel(root, file))) {
    error(diagnostics, `${file}: missing`);
    missingFileHint(file, diagnostics);
  } else {
    ok(diagnostics, `${file}: exists`);
  }
}

function checkManifest(root, diagnostics) {
  const manifest = readYaml(root, ".harness/manifest.yaml", diagnostics);
  if (!manifest?.harness) {
    if (manifest) error(diagnostics, ".harness/manifest.yaml: missing top-level harness key");
    return null;
  }

  const harness = manifest.harness;

  if (harness.manifest_version !== 1) {
    error(diagnostics, ".harness/manifest.yaml: manifest_version must be 1");
  } else {
    ok(diagnostics, ".harness/manifest.yaml: manifest_version 1");
  }

  if (!harness.harness_version) {
    error(diagnostics, ".harness/manifest.yaml: missing harness_version");
  }

  if (!harness.profile) {
    error(diagnostics, ".harness/manifest.yaml: missing profile");
  }

  if (!Array.isArray(harness.modules) || harness.modules.length === 0) {
    error(diagnostics, ".harness/manifest.yaml: modules must be a non-empty list");
  }

  if (!Array.isArray(harness.managed_files)) {
    error(diagnostics, ".harness/manifest.yaml: managed_files must be a list");
  }

  if (harness.commands && (typeof harness.commands !== "object" || Array.isArray(harness.commands))) {
    error(diagnostics, ".harness/manifest.yaml: commands must be a map when present");
  }

  return harness;
}

function checkCommandAvailability(root, manifest, diagnostics) {
  if (!manifest?.commands || typeof manifest.commands !== "object" || Array.isArray(manifest.commands)) {
    return;
  }

  const packageExists = existsSync(rel(root, "package.json"));
  const packageJson = packageExists ? readJson(root, "package.json", diagnostics) : null;
  const scripts = packageJson?.scripts ?? {};

  for (const [name, command] of Object.entries(manifest.commands)) {
    if (typeof command !== "string" || command.trim() === "") {
      error(diagnostics, `.harness/manifest.yaml: command '${name}' must be a non-empty string`);
      continue;
    }

    if (command === "npm test") {
      if (!packageExists) {
        error(diagnostics, `.harness/manifest.yaml: command '${name}' requires package.json`);
      } else if (!scripts.test) {
        error(diagnostics, `.harness/manifest.yaml: command '${name}' references missing package script 'test'`);
      } else {
        ok(diagnostics, `.harness/manifest.yaml: command '${name}' is wired`);
      }
      continue;
    }

    const npmRun = command.match(/^npm run ([^\s]+)$/);
    if (npmRun) {
      const script = npmRun[1];
      if (!packageExists) {
        error(diagnostics, `.harness/manifest.yaml: command '${name}' requires package.json`);
      } else if (!scripts[script]) {
        error(diagnostics, `.harness/manifest.yaml: command '${name}' references missing package script '${script}'`);
      } else {
        ok(diagnostics, `.harness/manifest.yaml: command '${name}' is wired`);
      }
      continue;
    }

    const nodeFile = command.match(/^node ([^\s]+)(?:\s|$)/);
    if (nodeFile) {
      assertFile(root, nodeFile[1], diagnostics);
      ok(diagnostics, `.harness/manifest.yaml: command '${name}' is wired`);
      continue;
    }

    if (command.startsWith("harness ")) {
      ok(diagnostics, `.harness/manifest.yaml: command '${name}' declares external harness CLI`);
      continue;
    }

    warn(diagnostics, `.harness/manifest.yaml: command '${name}' is not mechanically checked`);
  }
}

function checkModules(root, manifest, diagnostics) {
  const installed = new Map();
  if (!Array.isArray(manifest?.modules)) return installed;

  for (const moduleRef of manifest.modules) {
    if (!moduleRef?.id) {
      error(diagnostics, ".harness/manifest.yaml: module entry missing id");
      continue;
    }

    if (installed.has(moduleRef.id)) {
      error(diagnostics, `.harness/manifest.yaml: duplicate module id '${moduleRef.id}'`);
      continue;
    }

    const modulePath = `modules/${moduleRef.id}/module.yaml`;
    const moduleYaml = readYaml(root, modulePath, diagnostics);
    const module = moduleYaml?.module ?? null;
    installed.set(moduleRef.id, { ref: moduleRef, module, path: modulePath });

    if (!module) {
      if (moduleYaml) error(diagnostics, `${modulePath}: missing top-level module key`);
      continue;
    }

    if (module.id !== moduleRef.id) {
      error(
        diagnostics,
        `${modulePath}: module.id '${module.id}' does not match manifest id '${moduleRef.id}'`,
      );
    } else {
      ok(diagnostics, `${modulePath}: id matches manifest`);
    }

    if (module.version !== moduleRef.version) {
      warn(
        diagnostics,
        `${modulePath}: module version '${module.version}' differs from manifest version '${moduleRef.version}'`,
      );
    }

    if (!Array.isArray(module.process_domains) || module.process_domains.length === 0) {
      error(diagnostics, `${modulePath}: process_domains must be a non-empty list`);
    }

    const manifestDomains = new Set(moduleRef.process_domains ?? []);
    const moduleDomains = new Set(module.process_domains ?? []);
    for (const domain of manifestDomains) {
      if (!moduleDomains.has(domain)) {
        error(diagnostics, `${modulePath}: missing manifest process domain '${domain}'`);
      }
    }
  }

  return installed;
}

function checkModuleRegistry(root, diagnostics) {
  const file = "modules/registry.yaml";
  if (!existsSync(rel(root, file))) return null;

  const registry = readYaml(root, file, diagnostics);
  if (!registry) return null;

  if (!Array.isArray(registry.modules)) {
    error(diagnostics, `${file}: modules must be a list`);
    return null;
  }

  const ids = new Set();
  const entries = new Map();
  for (const entry of registry.modules) {
    if (!entry?.id) {
      error(diagnostics, `${file}: module entry missing id`);
      continue;
    }

    if (ids.has(entry.id)) {
      error(diagnostics, `${file}: duplicate module id '${entry.id}'`);
    }
    ids.add(entry.id);
    entries.set(entry.id, entry);

    if (!entry.path) {
      error(diagnostics, `${file}: module '${entry.id}' missing path`);
      continue;
    }

    const moduleYaml = readYaml(root, entry.path, diagnostics);
    const module = moduleYaml?.module;
    if (!module) {
      if (moduleYaml) error(diagnostics, `${entry.path}: missing top-level module key`);
      continue;
    }

    if (module.id !== entry.id) {
      error(diagnostics, `${file}: registry id '${entry.id}' does not match ${entry.path} module id '${module.id}'`);
    }
  }

  ok(diagnostics, `${file}: ${registry.modules.length} module(s) registered`);
  return entries;
}

function checkProfiles(root, registryEntries, diagnostics) {
  const dir = rel(root, "profiles");
  if (!existsSync(dir)) return;

  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .sort();
  const ids = new Set();

  for (const file of files) {
    const path = `profiles/${file}`;
    const yaml = readYaml(root, path, diagnostics);
    const profile = yaml?.profile;
    if (!profile) {
      if (yaml) error(diagnostics, `${path}: missing top-level profile key`);
      continue;
    }

    if (!profile.id) {
      error(diagnostics, `${path}: missing profile.id`);
      continue;
    }

    const expectedId = file.replace(/\.(ya?ml)$/, "");
    if (profile.id !== expectedId) {
      error(diagnostics, `${path}: profile.id '${profile.id}' does not match filename '${expectedId}'`);
    }

    if (ids.has(profile.id)) {
      error(diagnostics, `profiles/: duplicate profile id '${profile.id}'`);
    }
    ids.add(profile.id);

    if (!profile.status) {
      error(diagnostics, `${path}: missing profile.status`);
    }

    if (!Array.isArray(profile.modules) || profile.modules.length === 0) {
      error(diagnostics, `${path}: profile.modules must be a non-empty list`);
      continue;
    }

    const profileModuleIds = new Set();
    for (const moduleId of profile.modules) {
      if (profileModuleIds.has(moduleId)) {
        error(diagnostics, `${path}: duplicate module '${moduleId}'`);
      }
      profileModuleIds.add(moduleId);
    }

    if (registryEntries) {
      for (const moduleId of profile.modules) {
        if (!registryEntries.has(moduleId)) {
          error(diagnostics, `${path}: module '${moduleId}' is not in modules/registry.yaml`);
        }
      }
    }
  }

  ok(diagnostics, `profiles/: ${files.length} profile(s) validated`);
}

function checkInstalledModulesInRegistry(installedModules, registryEntries, diagnostics) {
  if (!registryEntries) return;

  for (const moduleId of installedModules.keys()) {
    if (!registryEntries.has(moduleId)) {
      warn(diagnostics, `.harness/manifest.yaml: installed module '${moduleId}' is not in modules/registry.yaml`);
    }
  }
}

function checkManagedFiles(root, manifest, installedModules, diagnostics) {
  if (!Array.isArray(manifest?.managed_files)) return;

  const seenPaths = new Set();
  const manifestByOwnerPath = new Map();

  for (const file of manifest.managed_files) {
    if (!file?.path) {
      error(diagnostics, ".harness/manifest.yaml: managed file entry missing path");
      continue;
    }

    if (seenPaths.has(file.path)) {
      error(diagnostics, `.harness/manifest.yaml: duplicate managed file '${file.path}'`);
    }
    seenPaths.add(file.path);

    if (!installedModules.has(file.owner)) {
      error(
        diagnostics,
        `.harness/manifest.yaml: managed file '${file.path}' owner '${file.owner}' is not an installed module`,
      );
    }

    if (!VALID_MANAGED_FILE_MODES.has(file.mode)) {
      error(
        diagnostics,
        `.harness/manifest.yaml: managed file '${file.path}' has invalid mode '${file.mode}'`,
      );
    }

    manifestByOwnerPath.set(`${file.owner}:${file.path}`, file);
    assertFile(root, file.path, diagnostics);
  }

  for (const [moduleId, installed] of installedModules.entries()) {
    const moduleFiles = installed.module?.managed_files;
    if (!Array.isArray(moduleFiles)) continue;

    for (const moduleFile of moduleFiles) {
      const path = moduleFile?.path;
      if (!path) {
        error(diagnostics, `${installed.path}: managed file entry missing path`);
        continue;
      }

      const manifestFile = manifestByOwnerPath.get(`${moduleId}:${path}`);
      if (!manifestFile) {
        error(diagnostics, `${installed.path}: managed file '${path}' is not represented in manifest`);
        continue;
      }

      if (moduleFile.mode && manifestFile.mode !== moduleFile.mode) {
        warn(
          diagnostics,
          `${installed.path}: managed file '${path}' mode '${moduleFile.mode}' differs from manifest mode '${manifestFile.mode}'`,
        );
      }
    }
  }
}

function checkLock(root, manifest, diagnostics) {
  const loaded = readLock(root);
  if (loaded.status === "missing") {
    warn(diagnostics, ".harness/lock.yaml: missing; provenance checks are unavailable");
    hint(diagnostics, "Run `harness lock refresh` to recreate installed-file provenance.");
    return;
  }

  if (loaded.status === "invalid") {
    error(diagnostics, loaded.error);
    hint(diagnostics, "Fix .harness/lock.yaml syntax or recreate the lock from installed harness state.");
    return;
  }

  const lock = loaded.lock;
  if (lock.version !== 1) {
    error(diagnostics, ".harness/lock.yaml: version must be 1");
  } else {
    ok(diagnostics, ".harness/lock.yaml: version 1");
  }

  if (!Array.isArray(lock.files)) {
    error(diagnostics, ".harness/lock.yaml: files must be a list");
    return;
  }

  const seenPaths = new Set();
  for (const file of lock.files) {
    if (!file?.path) {
      error(diagnostics, ".harness/lock.yaml: file entry missing path");
      continue;
    }

    if (seenPaths.has(file.path)) {
      error(diagnostics, `.harness/lock.yaml: duplicate file entry '${file.path}'`);
    }
    seenPaths.add(file.path);

    if (!VALID_SHA256.test(String(file.sha256 ?? ""))) {
      error(diagnostics, `.harness/lock.yaml: file '${file.path}' has invalid sha256`);
      continue;
    }

    if (file.source_sha256 && !VALID_SHA256.test(String(file.source_sha256))) {
      error(diagnostics, `.harness/lock.yaml: file '${file.path}' has invalid source_sha256`);
    }

    if (file.artifact_role && !VALID_LOCK_ARTIFACT_ROLES.has(file.artifact_role)) {
      error(diagnostics, `.harness/lock.yaml: file '${file.path}' has invalid artifact_role '${file.artifact_role}'`);
    }

    if (file.owner_type && !VALID_LOCK_OWNER_TYPES.has(file.owner_type)) {
      error(diagnostics, `.harness/lock.yaml: file '${file.path}' has invalid owner_type '${file.owner_type}'`);
    }

    if (file.merge_strategy && !VALID_MANAGED_FILE_MODES.has(file.merge_strategy)) {
      error(
        diagnostics,
        `.harness/lock.yaml: file '${file.path}' has invalid merge_strategy '${file.merge_strategy}'`,
      );
    }

    if (!existsSync(rel(root, file.path))) {
      error(diagnostics, `.harness/lock.yaml: locked file '${file.path}' is missing`);
      continue;
    }

    const actual = hashFile(root, file.path);
    if (actual === file.sha256) {
      ok(diagnostics, `${file.path}: lock fingerprint matches`);
    } else {
      warn(diagnostics, `${file.path}: differs from lock fingerprint`);
    }
  }

  const lockedPaths = lockFileMap(lock);
  for (const path of expectedLockPaths(manifest, { root })) {
    if (!lockedPaths.has(path)) {
      warn(diagnostics, `.harness/lock.yaml: expected lock entry for '${path}'`);
    }
  }
}

function checkIndex(root, diagnostics) {
  const index = readYaml(root, "index.yaml", diagnostics);
  if (!index) return;

  if (Array.isArray(index.orientation?.boot_order)) {
    for (const file of index.orientation.boot_order) {
      assertFile(root, file, diagnostics);
    }
  } else {
    error(diagnostics, "index.yaml: orientation.boot_order must be a list");
  }

  if (!Array.isArray(index.documents)) {
    error(diagnostics, "index.yaml: documents must be a list");
    return;
  }

  const ids = new Set();
  for (const doc of index.documents) {
    if (!doc?.doc_id) {
      error(diagnostics, "index.yaml: document entry missing doc_id");
      continue;
    }
    if (ids.has(doc.doc_id)) {
      error(diagnostics, `index.yaml: duplicate doc_id '${doc.doc_id}'`);
    }
    ids.add(doc.doc_id);

    if (!doc.file) {
      error(diagnostics, `index.yaml: document '${doc.doc_id}' missing file`);
    } else {
      assertFile(root, doc.file, diagnostics);
    }
  }

  if (Array.isArray(index.reading_order)) {
    for (const id of index.reading_order) {
      if (!ids.has(id)) {
        error(diagnostics, `index.yaml: reading_order references unknown doc_id '${id}'`);
      }
    }
  } else {
    error(diagnostics, "index.yaml: reading_order must be a list");
  }

  for (const doc of index.documents) {
    if (!doc?.doc_id || !Array.isArray(doc.depends_on)) continue;
    for (const dependency of doc.depends_on) {
      if (!ids.has(dependency)) {
        error(
          diagnostics,
          `index.yaml: document '${doc.doc_id}' depends_on unknown doc_id '${dependency}'`,
        );
      }
    }
  }
}

function checkStatus(root, diagnostics) {
  const text = readText(root, "status.md", diagnostics);
  if (text == null) return;

  if (!/^Last updated:\s+\d{4}-\d{2}-\d{2}$/m.test(text)) {
    error(diagnostics, "status.md: missing 'Last updated: YYYY-MM-DD' line");
  } else {
    ok(diagnostics, "status.md: has Last updated line");
  }
}

function checkOpenQuestions(root, diagnostics) {
  const questions = readYaml(root, "open-questions.yaml", diagnostics);
  if (!Array.isArray(questions)) {
    error(diagnostics, "open-questions.yaml: expected a top-level list");
    return;
  }

  const ids = new Set();
  for (const question of questions) {
    if (!question?.id) {
      error(diagnostics, "open-questions.yaml: question entry missing id");
      continue;
    }

    if (ids.has(question.id)) {
      error(diagnostics, `open-questions.yaml: duplicate id '${question.id}'`);
    }
    ids.add(question.id);

    if (!/^[a-z0-9-]+$/.test(question.id)) {
      error(diagnostics, `open-questions.yaml: id '${question.id}' must be kebab-case`);
    }

    if (!question.title) {
      error(diagnostics, `open-questions.yaml: question '${question.id}' missing title`);
    }

    if (!VALID_OPEN_QUESTION_STATUSES.has(question.status)) {
      error(
        diagnostics,
        `open-questions.yaml: question '${question.id}' has invalid status '${question.status}'`,
      );
    }

    if (!question.owner) {
      error(diagnostics, `open-questions.yaml: question '${question.id}' missing owner`);
    }

    if (!question.trigger) {
      error(diagnostics, `open-questions.yaml: question '${question.id}' missing trigger`);
    }
  }

  ok(diagnostics, `open-questions.yaml: ${questions.length} question(s) validated`);
}

function checkDecisionRecords(root, diagnostics) {
  const dir = rel(root, "decisions");
  if (!existsSync(dir)) {
    error(diagnostics, "decisions/: missing");
    hint(diagnostics, "Create decision records with `harness decisions new \"<title>\"` when decisions are made.");
    return;
  }

  const ids = new Set();
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort();

  for (const file of files) {
    const match = file.match(/^(\d{4})-[a-z0-9-]+\.md$/);
    const relFile = `decisions/${file}`;
    if (!match) {
      error(diagnostics, `${relFile}: filename must match NNNN-slug.md`);
      continue;
    }

    const text = readText(root, relFile, diagnostics);
    if (text == null) continue;

    const fm = parseFrontmatter(text, relFile, diagnostics);
    if (!fm) continue;

    const fileId = Number.parseInt(match[1], 10);
    if (fm.id !== fileId) {
      error(diagnostics, `${relFile}: frontmatter id '${fm.id}' does not match filename id '${fileId}'`);
    }

    if (ids.has(fm.id)) {
      error(diagnostics, `${relFile}: duplicate decision id '${fm.id}'`);
    }
    ids.add(fm.id);

    if (!fm.title) {
      error(diagnostics, `${relFile}: missing title`);
    }

    if (!VALID_DECISION_STATUSES.has(fm.status)) {
      error(diagnostics, `${relFile}: invalid status '${fm.status}'`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fm.date ?? ""))) {
      error(diagnostics, `${relFile}: date must be YYYY-MM-DD`);
    }

    for (const heading of ["## Context", "## Decision", "## Consequences"]) {
      if (!text.includes(heading)) {
        error(diagnostics, `${relFile}: missing '${heading}' section`);
      }
    }
  }

  ok(diagnostics, `decisions/: ${files.length} decision record(s) validated`);
}

function checkDecisionsOpenQuestions(root, installedModules, diagnostics) {
  if (!installedModules.has("decisions-open-questions")) return;

  checkOpenQuestions(root, diagnostics);
  checkDecisionRecords(root, diagnostics);
}

function checkStructuredMetadata(root, installedModules, diagnostics) {
  if (!installedModules.has("structured-metadata")) return;

  const result = validateMetadata(root);
  for (const item of result.errors) {
    error(diagnostics, item);
  }
  for (const item of result.warnings) {
    warn(diagnostics, item);
  }
  if (result.ok) {
    ok(diagnostics, `metadata/artifacts.yaml: ${result.artifacts.length} artifact(s) validated`);
  }
}

function checkCanonicalState(root, installedModules, diagnostics) {
  if (!installedModules.has("canonical-state")) return;

  const result = validateCanonicalState(root);
  for (const item of result.errors) {
    error(diagnostics, item);
  }
  for (const item of result.warnings) {
    warn(diagnostics, item);
  }
  if (result.ok) {
    ok(diagnostics, `state/canonical-state.yaml: ${result.entries.length} canonical state entry(s) validated`);
  }
}

function checkInvariants(root, installedModules, diagnostics) {
  if (!installedModules.has("invariants-golden-principles")) return;

  const result = validateInvariants(root);
  for (const item of result.errors) {
    error(diagnostics, item);
  }
  for (const item of result.warnings) {
    warn(diagnostics, item);
  }
  if (result.ok) {
    ok(
      diagnostics,
      `invariants/golden-principles.yaml: ${result.principles.length} invariant principle(s) validated`,
    );
  }
}

function checkPlansStatus(root, installedModules, diagnostics) {
  if (!installedModules.has("plans-and-status")) return;

  const result = validatePlansStatus(root);
  for (const item of result.errors) {
    error(diagnostics, item);
  }
  for (const item of result.warnings) {
    warn(diagnostics, item);
  }
  if (result.ok) {
    ok(diagnostics, `plans/current.yaml: ${result.plans.length} plan(s) validated`);
  }
}

function checkDurableMemory(root, installedModules, diagnostics) {
  if (!installedModules.has("durable-memory")) return;

  const result = validateMemory(root);
  for (const item of result.errors) {
    error(diagnostics, item);
  }
  for (const item of result.warnings) {
    warn(diagnostics, item);
  }
  if (result.ok) {
    ok(diagnostics, `memory/operator-preferences.yaml: ${result.preferences.length} preference(s) validated`);
  }
}

function checkCaptureTriage(root, installedModules, diagnostics) {
  if (!installedModules.has("capture-triage")) return;

  const result = validateCapture(root);
  for (const item of result.errors) {
    error(diagnostics, item);
  }
  for (const item of result.warnings) {
    warn(diagnostics, item);
  }
  if (result.ok) {
    ok(diagnostics, `capture/inbox.yaml: ${result.items.length} capture item(s) validated`);
  }
}

function checkApplicationCorpusLegibility(root, installedModules, diagnostics) {
  if (!installedModules.has("application-corpus-legibility")) return;

  const result = validateLegibility(root);
  for (const item of result.errors) {
    error(diagnostics, item);
  }
  for (const item of result.warnings) {
    warn(diagnostics, item);
  }
  if (result.ok) {
    ok(diagnostics, `legibility/inventory.yaml: ${result.surfaces.length} inspection surface(s) validated`);
  }
}

function checkReportsRetrieval(root, installedModules, diagnostics) {
  if (!installedModules.has("reports-retrieval")) return;

  const result = validateReports(root);
  for (const item of result.errors) {
    error(diagnostics, item);
  }
  for (const item of result.warnings) {
    warn(diagnostics, item);
  }
  if (result.ok) {
    ok(diagnostics, `reports/catalog.yaml: ${result.definitions.length} report definition(s) validated`);
  }
}

function checkDepthCriterion(path, criterion, diagnostics) {
  if (!criterion?.id) {
    error(diagnostics, `${path}: depth criterion missing id`);
  }

  if (!VALID_DEPTH_STATUSES.has(criterion?.status)) {
    error(diagnostics, `${path}: criterion '${criterion?.id ?? "unknown"}' has invalid status '${criterion?.status}'`);
  }

  if (!Array.isArray(criterion?.evidence) || criterion.evidence.length === 0) {
    error(diagnostics, `${path}: criterion '${criterion?.id ?? "unknown"}' must include evidence`);
  }
}

function checkDepthPass(path, pass, diagnostics, { completed = false } = {}) {
  if (!pass?.id) {
    error(diagnostics, `${path}: depth pass missing id`);
  }

  if (!pass?.breadth_unit) {
    error(diagnostics, `${path}: depth pass '${pass?.id ?? "unknown"}' missing breadth_unit`);
  }

  if (typeof pass?.ready_for_next_breadth !== "boolean") {
    error(diagnostics, `${path}: depth pass '${pass?.id ?? "unknown"}' missing boolean ready_for_next_breadth`);
  }

  if (!Array.isArray(pass?.depth_criteria) || pass.depth_criteria.length === 0) {
    error(diagnostics, `${path}: depth pass '${pass?.id ?? "unknown"}' must include depth_criteria`);
    return;
  }

  for (const criterion of pass.depth_criteria) {
    checkDepthCriterion(path, criterion, diagnostics);
  }

  const allSatisfied = pass.depth_criteria.every((criterion) =>
    criterion.status === "satisfied" || criterion.status === "deferred",
  );

  if (pass.ready_for_next_breadth && !allSatisfied) {
    error(
      diagnostics,
      `${path}: depth pass '${pass.id}' is ready_for_next_breadth but has unsatisfied criteria`,
    );
  }

  if (!pass.ready_for_next_breadth && allSatisfied) {
    warn(
      diagnostics,
      `${path}: depth pass '${pass.id}' has all criteria satisfied but ready_for_next_breadth is false`,
    );
  }

  if (completed && !pass.ready_for_next_breadth) {
    error(diagnostics, `${path}: completed depth pass '${pass.id}' must be ready_for_next_breadth`);
  }
}

function checkDepthGate(root, diagnostics) {
  const file = "build/depth-gate.yaml";
  if (!existsSync(rel(root, file))) return;

  const yaml = readYaml(root, file, diagnostics);
  const gate = yaml?.build_strategy;
  if (!gate) {
    error(diagnostics, `${file}: missing top-level build_strategy key`);
    return;
  }

  if (gate.version !== 1) {
    error(diagnostics, `${file}: version must be 1`);
  }

  if (gate.scope !== "harness-repo-local") {
    error(diagnostics, `${file}: scope must be harness-repo-local`);
  }

  if (gate.portable_process_domain !== false) {
    error(diagnostics, `${file}: portable_process_domain must be false`);
  }

  if (!gate.strategy_doc) {
    error(diagnostics, `${file}: missing strategy_doc`);
  } else {
    assertFile(root, gate.strategy_doc, diagnostics);
  }

  if (!Array.isArray(gate.enforcement) || gate.enforcement.length === 0) {
    error(diagnostics, `${file}: enforcement must be a non-empty list`);
  }

  if (!Array.isArray(gate.completed_depth_passes)) {
    error(diagnostics, `${file}: completed_depth_passes must be a list`);
  } else {
    for (const pass of gate.completed_depth_passes) {
      checkDepthPass(file, pass, diagnostics, { completed: true });
    }
  }

  checkDepthPass(file, gate.current_depth_pass, diagnostics);
  ok(diagnostics, `${file}: depth gate validated`);
}

function printGroup(label, prefix, items) {
  if (items.length === 0) return;
  console.log(`${label}:`);
  for (const item of items) {
    console.log(`${prefix} ${item}`);
  }
  console.log("");
}

function printDiagnostics(diagnostics) {
  printGroup("OK", "ok  ", diagnostics.ok);
  printGroup("WARNINGS", "warn", diagnostics.warnings);
  printGroup("FAILURES", "fail", diagnostics.errors);
  printGroup("HINTS", "hint", diagnostics.hints);

  console.log(
    `Harness doctor: ${diagnostics.errors.length} error(s), ${diagnostics.warnings.length} warning(s)`,
  );
}

export function runDoctor({ cwd = process.cwd() } = {}) {
  const root = resolve(cwd);
  const diagnostics = createDiagnostics();

  const manifest = checkManifest(root, diagnostics);
  checkCommandAvailability(root, manifest, diagnostics);
  const registryEntries = checkModuleRegistry(root, diagnostics);
  checkProfiles(root, registryEntries, diagnostics);
  const installedModules = checkModules(root, manifest, diagnostics);
  checkInstalledModulesInRegistry(installedModules, registryEntries, diagnostics);
  checkManagedFiles(root, manifest, installedModules, diagnostics);
  checkLock(root, manifest, diagnostics);
  checkIndex(root, diagnostics);
  checkStatus(root, diagnostics);
  checkDecisionsOpenQuestions(root, installedModules, diagnostics);
  checkStructuredMetadata(root, installedModules, diagnostics);
  checkCanonicalState(root, installedModules, diagnostics);
  checkInvariants(root, installedModules, diagnostics);
  checkPlansStatus(root, installedModules, diagnostics);
  checkDurableMemory(root, installedModules, diagnostics);
  checkCaptureTriage(root, installedModules, diagnostics);
  checkApplicationCorpusLegibility(root, installedModules, diagnostics);
  checkReportsRetrieval(root, installedModules, diagnostics);
  checkDepthGate(root, diagnostics);

  printDiagnostics(diagnostics);
  const resultDiagnostics = publicDiagnostics(diagnostics);
  return { ok: resultDiagnostics.errors.length === 0, diagnostics: resultDiagnostics };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runDoctor({ cwd: process.cwd() });
  process.exit(result.ok ? 0 : 2);
}
