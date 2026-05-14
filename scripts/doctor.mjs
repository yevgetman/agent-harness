import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const VALID_MANAGED_FILE_MODES = new Set(["create", "merge", "replace", "observe"]);
const VALID_DECISION_STATUSES = new Set(["proposed", "accepted", "superseded", "reversed"]);
const VALID_OPEN_QUESTION_STATUSES = new Set(["open", "in_progress", "resolved", "deferred"]);

function rel(root, file) {
  return join(root, file);
}

function readText(root, file, diagnostics) {
  const path = rel(root, file);
  if (!existsSync(path)) {
    diagnostics.errors.push(`${file}: missing`);
    return null;
  }
  return readFileSync(path, "utf8");
}

function readYaml(root, file, diagnostics) {
  const text = readText(root, file, diagnostics);
  if (text == null) return null;

  try {
    return parseYaml(text);
  } catch (error) {
    diagnostics.errors.push(`${file}: YAML parse error: ${error.message}`);
    return null;
  }
}

function parseFrontmatter(text, file, diagnostics) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    diagnostics.errors.push(`${file}: missing YAML frontmatter`);
    return null;
  }

  try {
    return parseYaml(match[1]);
  } catch (error) {
    diagnostics.errors.push(`${file}: frontmatter YAML parse error: ${error.message}`);
    return null;
  }
}

function assertFile(root, file, diagnostics) {
  if (!existsSync(rel(root, file))) {
    diagnostics.errors.push(`${file}: missing`);
  } else {
    diagnostics.ok.push(`${file}: exists`);
  }
}

function checkManifest(root, diagnostics) {
  const manifest = readYaml(root, ".harness/manifest.yaml", diagnostics);
  if (!manifest?.harness) return null;

  const harness = manifest.harness;

  if (harness.manifest_version !== 1) {
    diagnostics.errors.push(
      `.harness/manifest.yaml: manifest_version must be 1`,
    );
  } else {
    diagnostics.ok.push(`.harness/manifest.yaml: manifest_version 1`);
  }

  if (!harness.harness_version) {
    diagnostics.errors.push(`.harness/manifest.yaml: missing harness_version`);
  }

  if (!harness.profile) {
    diagnostics.errors.push(`.harness/manifest.yaml: missing profile`);
  }

  if (!Array.isArray(harness.modules) || harness.modules.length === 0) {
    diagnostics.errors.push(`.harness/manifest.yaml: modules must be a non-empty list`);
  }

  if (!Array.isArray(harness.managed_files)) {
    diagnostics.errors.push(`.harness/manifest.yaml: managed_files must be a list`);
  }

  return harness;
}

function checkModules(root, manifest, diagnostics) {
  if (!Array.isArray(manifest?.modules)) return new Map();

  const installed = new Map();
  for (const moduleRef of manifest.modules) {
    if (!moduleRef?.id) {
      diagnostics.errors.push(`.harness/manifest.yaml: module entry missing id`);
      continue;
    }

    if (installed.has(moduleRef.id)) {
      diagnostics.errors.push(`.harness/manifest.yaml: duplicate module id '${moduleRef.id}'`);
      continue;
    }

    installed.set(moduleRef.id, moduleRef);
    const modulePath = `modules/${moduleRef.id}/module.yaml`;
    const moduleYaml = readYaml(root, modulePath, diagnostics);
    const module = moduleYaml?.module;
    if (!module) continue;

    if (module.id !== moduleRef.id) {
      diagnostics.errors.push(`${modulePath}: module.id '${module.id}' does not match manifest id '${moduleRef.id}'`);
    } else {
      diagnostics.ok.push(`${modulePath}: id matches manifest`);
    }

    if (module.version !== moduleRef.version) {
      diagnostics.warnings.push(`${modulePath}: module version '${module.version}' differs from manifest version '${moduleRef.version}'`);
    }

    const manifestDomains = new Set(moduleRef.process_domains ?? []);
    const moduleDomains = new Set(module.process_domains ?? []);
    for (const domain of manifestDomains) {
      if (!moduleDomains.has(domain)) {
        diagnostics.errors.push(`${modulePath}: missing manifest process domain '${domain}'`);
      }
    }
  }

  return installed;
}

function checkManagedFiles(root, manifest, installedModules, diagnostics) {
  if (!Array.isArray(manifest?.managed_files)) return;

  for (const file of manifest.managed_files) {
    if (!file?.path) {
      diagnostics.errors.push(`.harness/manifest.yaml: managed file entry missing path`);
      continue;
    }

    if (!installedModules.has(file.owner)) {
      diagnostics.errors.push(`.harness/manifest.yaml: managed file '${file.path}' owner '${file.owner}' is not an installed module`);
    }

    if (!VALID_MANAGED_FILE_MODES.has(file.mode)) {
      diagnostics.errors.push(`.harness/manifest.yaml: managed file '${file.path}' has invalid mode '${file.mode}'`);
    }

    assertFile(root, file.path, diagnostics);
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
    diagnostics.errors.push(`index.yaml: orientation.boot_order must be a list`);
  }

  if (!Array.isArray(index.documents)) {
    diagnostics.errors.push(`index.yaml: documents must be a list`);
    return;
  }

  const ids = new Set();
  for (const doc of index.documents) {
    if (!doc?.doc_id) {
      diagnostics.errors.push(`index.yaml: document entry missing doc_id`);
      continue;
    }
    if (ids.has(doc.doc_id)) {
      diagnostics.errors.push(`index.yaml: duplicate doc_id '${doc.doc_id}'`);
    }
    ids.add(doc.doc_id);

    if (!doc.file) {
      diagnostics.errors.push(`index.yaml: document '${doc.doc_id}' missing file`);
    } else {
      assertFile(root, doc.file, diagnostics);
    }
  }

  if (Array.isArray(index.reading_order)) {
    for (const id of index.reading_order) {
      if (!ids.has(id)) {
        diagnostics.errors.push(`index.yaml: reading_order references unknown doc_id '${id}'`);
      }
    }
  } else {
    diagnostics.errors.push(`index.yaml: reading_order must be a list`);
  }
}

function checkStatus(root, diagnostics) {
  const text = readText(root, "status.md", diagnostics);
  if (text == null) return;

  if (!/^Last updated:\s+\d{4}-\d{2}-\d{2}$/m.test(text)) {
    diagnostics.errors.push(`status.md: missing 'Last updated: YYYY-MM-DD' line`);
  } else {
    diagnostics.ok.push(`status.md: has Last updated line`);
  }
}

function checkOpenQuestions(root, diagnostics) {
  const questions = readYaml(root, "open-questions.yaml", diagnostics);
  if (!Array.isArray(questions)) {
    diagnostics.errors.push(`open-questions.yaml: expected a top-level list`);
    return;
  }

  const ids = new Set();
  for (const question of questions) {
    if (!question?.id) {
      diagnostics.errors.push(`open-questions.yaml: question entry missing id`);
      continue;
    }

    if (ids.has(question.id)) {
      diagnostics.errors.push(`open-questions.yaml: duplicate id '${question.id}'`);
    }
    ids.add(question.id);

    if (!/^[a-z0-9-]+$/.test(question.id)) {
      diagnostics.errors.push(`open-questions.yaml: id '${question.id}' must be kebab-case`);
    }

    if (!question.title) {
      diagnostics.errors.push(`open-questions.yaml: question '${question.id}' missing title`);
    }

    if (!VALID_OPEN_QUESTION_STATUSES.has(question.status)) {
      diagnostics.errors.push(`open-questions.yaml: question '${question.id}' has invalid status '${question.status}'`);
    }

    if (!question.owner) {
      diagnostics.errors.push(`open-questions.yaml: question '${question.id}' missing owner`);
    }

    if (!question.trigger) {
      diagnostics.errors.push(`open-questions.yaml: question '${question.id}' missing trigger`);
    }
  }

  diagnostics.ok.push(`open-questions.yaml: ${questions.length} question(s) validated`);
}

function checkDecisionRecords(root, diagnostics) {
  const dir = rel(root, "decisions");
  if (!existsSync(dir)) {
    diagnostics.errors.push(`decisions/: missing`);
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
      diagnostics.errors.push(`${relFile}: filename must match NNNN-slug.md`);
      continue;
    }

    const text = readText(root, relFile, diagnostics);
    if (text == null) continue;

    const fm = parseFrontmatter(text, relFile, diagnostics);
    if (!fm) continue;

    const fileId = Number.parseInt(match[1], 10);
    if (fm.id !== fileId) {
      diagnostics.errors.push(`${relFile}: frontmatter id '${fm.id}' does not match filename id '${fileId}'`);
    }

    if (ids.has(fm.id)) {
      diagnostics.errors.push(`${relFile}: duplicate decision id '${fm.id}'`);
    }
    ids.add(fm.id);

    if (!fm.title) {
      diagnostics.errors.push(`${relFile}: missing title`);
    }

    if (!VALID_DECISION_STATUSES.has(fm.status)) {
      diagnostics.errors.push(`${relFile}: invalid status '${fm.status}'`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fm.date ?? ""))) {
      diagnostics.errors.push(`${relFile}: date must be YYYY-MM-DD`);
    }

    for (const heading of ["## Context", "## Decision", "## Consequences"]) {
      if (!text.includes(heading)) {
        diagnostics.errors.push(`${relFile}: missing '${heading}' section`);
      }
    }
  }

  diagnostics.ok.push(`decisions/: ${files.length} decision record(s) validated`);
}

function checkDecisionsOpenQuestions(root, installedModules, diagnostics) {
  if (!installedModules.has("decisions-open-questions")) return;

  checkOpenQuestions(root, diagnostics);
  checkDecisionRecords(root, diagnostics);
}

function printDiagnostics(diagnostics) {
  for (const item of diagnostics.ok) {
    console.log(`ok   ${item}`);
  }
  for (const item of diagnostics.warnings) {
    console.log(`warn ${item}`);
  }
  for (const item of diagnostics.errors) {
    console.log(`fail ${item}`);
  }

  console.log("");
  console.log(
    `Harness doctor: ${diagnostics.errors.length} error(s), ${diagnostics.warnings.length} warning(s)`,
  );
}

export function runDoctor({ cwd = process.cwd() } = {}) {
  const root = resolve(cwd);
  const diagnostics = { ok: [], warnings: [], errors: [] };

  const manifest = checkManifest(root, diagnostics);
  const installedModules = checkModules(root, manifest, diagnostics);
  checkManagedFiles(root, manifest, installedModules, diagnostics);
  checkIndex(root, diagnostics);
  checkStatus(root, diagnostics);
  checkDecisionsOpenQuestions(root, installedModules, diagnostics);

  printDiagnostics(diagnostics);
  return { ok: diagnostics.errors.length === 0, diagnostics };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runDoctor({ cwd: process.cwd() });
  process.exit(result.ok ? 0 : 2);
}
