import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(SCRIPT_DIR, "..");

function readYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function profilesDir(sourceRoot) {
  return join(sourceRoot, "profiles");
}

export function loadProfiles(sourceRoot = SOURCE_ROOT) {
  const dir = profilesDir(sourceRoot);
  if (!existsSync(dir)) {
    return { profiles: [], errors: ["profiles/: missing"] };
  }

  const profiles = [];
  const errors = [];
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .sort();

  for (const file of files) {
    const path = join(dir, file);
    let yaml;
    try {
      yaml = readYamlFile(path);
    } catch (parseError) {
      errors.push(`profiles/${file}: YAML parse error: ${parseError.message}`);
      continue;
    }

    const profile = yaml?.profile;
    if (!profile?.id) {
      errors.push(`profiles/${file}: missing profile.id`);
      continue;
    }

    profiles.push({
      id: profile.id,
      status: profile.status ?? "unknown",
      modules: Array.isArray(profile.modules) ? profile.modules : [],
      path: `profiles/${file}`,
    });
  }

  return { profiles, errors };
}

export function loadProfile(profileId, sourceRoot = SOURCE_ROOT) {
  const loaded = loadProfiles(sourceRoot);
  if (loaded.errors.length > 0) return { error: loaded.errors.join("; ") };

  const profile = loaded.profiles.find((item) => item.id === profileId);
  if (!profile) {
    const available = loaded.profiles.map((item) => item.id).join(", ") || "none";
    return { error: `unsupported profile '${profileId}' (available: ${available})` };
  }

  if (profile.modules.length === 0) {
    return { error: `profile '${profileId}' has no modules` };
  }

  return { profile };
}

function printHelp() {
  console.log(`harness profiles

Usage:
  harness profiles list
`);
}

function runList({ sourceRoot }) {
  const loaded = loadProfiles(sourceRoot);
  if (loaded.errors.length > 0) {
    for (const error of loaded.errors) {
      console.error(`fail ${error}`);
    }
    return { ok: false, errors: loaded.errors };
  }

  for (const profile of loaded.profiles) {
    console.log(`${profile.id} ${profile.status} modules=${profile.modules.join(",")}`);
  }

  return { ok: true, profiles: loaded.profiles };
}

export function runProfiles({ args = [], sourceRoot = SOURCE_ROOT } = {}) {
  const [subcommand] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return { ok: true };
  }

  if (subcommand === "list") {
    return runList({ sourceRoot });
  }

  console.error(`fail unknown profiles command '${subcommand}'`);
  printHelp();
  return { ok: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runProfiles({ args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
