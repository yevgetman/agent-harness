#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_PROFILES = ["minimal", "dogfood"];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function commandError(error) {
  const stderr = error.stderr?.toString?.().trim();
  const stdout = error.stdout?.toString?.().trim();
  return stderr || stdout || error.message;
}

function printHelp() {
  console.log(`harness distribution

Usage:
  harness distribution smoke [--profile <profile>] [--json] [--keep]

Commands:
  smoke    Pack the local npm package and validate installed target repos.

Options:
  --profile <profile>  Profile to smoke. May be repeated. Defaults to minimal and dogfood.
  --json               Emit JSON result.
  --keep               Keep the temporary smoke directory for debugging.
`);
}

function profileArgs(args) {
  const profiles = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--profile" && i + 1 < args.length) {
      profiles.push(args[i + 1]);
      i += 1;
    }
  }
  return profiles.length > 0 ? profiles : DEFAULT_PROFILES;
}

function packPackage(workRoot) {
  const packDir = join(workRoot, "pack");
  mkdirSync(packDir, { recursive: true });
  const output = run("npm", ["pack", SOURCE_ROOT, "--pack-destination", packDir, "--json"], {
    cwd: SOURCE_ROOT,
  });
  const packed = JSON.parse(output);
  const filename = packed?.[0]?.filename;
  if (!filename) {
    return { error: "npm pack did not report a tarball filename" };
  }

  const tarball = join(packDir, filename);
  if (!existsSync(tarball)) {
    return { error: `${tarball}: packed tarball is missing` };
  }

  return {
    tarball,
    package_name: packed[0].name,
    package_version: packed[0].version,
    file_count: packed[0].entryCount,
  };
}

function smokeProfile({ workRoot, tarball, profile }) {
  const target = join(workRoot, `target-${profile}`);
  mkdirSync(target, { recursive: true });

  try {
    run("git", ["init"], { cwd: target });
    run("npm", ["init", "-y"], { cwd: target });
    run("npm", ["install", tarball, "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: target });

    const harnessBin = join(target, "node_modules", ".bin", "harness");
    if (!existsSync(harnessBin)) {
      return {
        profile,
        target,
        ok: false,
        errors: [`${harnessBin}: installed harness binary is missing`],
      };
    }

    run(harnessBin, ["init", "--profile", profile, "--target", "."], { cwd: target });
    run(harnessBin, ["doctor"], { cwd: target });
    const plan = JSON.parse(run(harnessBin, ["upgrade", "--plan", "--json"], { cwd: target }));
    const errors = [];

    if (plan.version_source?.type !== "package") {
      errors.push(`upgrade plan version_source.type is '${plan.version_source?.type ?? "missing"}', expected 'package'`);
    }

    for (const blocker of plan.blockers ?? []) {
      errors.push(`upgrade blocker: ${blocker}`);
    }

    for (const warning of plan.warnings ?? []) {
      errors.push(`upgrade warning: ${warning}`);
    }

    return {
      profile,
      target,
      ok: errors.length === 0,
      errors,
      version_source: plan.version_source,
      managed_files: plan.managed_files?.length ?? 0,
      commands: plan.commands?.length ?? 0,
    };
  } catch (error) {
    return {
      profile,
      target,
      ok: false,
      errors: [commandError(error)],
      version_source: null,
      managed_files: 0,
      commands: 0,
    };
  }
}

function printResult(result) {
  console.log("Harness distribution smoke");
  console.log(`status: ${result.ok ? "ok" : "error"}`);
  console.log(`package: ${result.package_name}@${result.package_version}`);
  console.log(`tarball_entries: ${result.file_count}`);
  console.log(`work_root: ${result.work_root}${result.kept ? "" : " (removed)"}`);
  console.log("profiles:");
  for (const profile of result.profiles) {
    console.log(`  ${profile.profile}: ${profile.ok ? "ok" : "error"}`);
    console.log(`    version_source: ${profile.version_source?.type ?? "unknown"}`);
    console.log(`    managed_files: ${profile.managed_files}`);
    console.log(`    commands: ${profile.commands}`);
    for (const error of profile.errors) {
      console.log(`    error: ${error}`);
    }
  }
}

function runSmoke(args) {
  const keep = args.includes("--keep");
  const workRoot = mkdtempSync(join(tmpdir(), "harness-distribution-smoke-"));
  let result;

  try {
    const packed = packPackage(workRoot);
    if (packed.error) {
      result = {
        ok: false,
        work_root: workRoot,
        kept: keep,
        package_name: "unknown",
        package_version: "unknown",
        file_count: 0,
        profiles: [],
        errors: [packed.error],
      };
      return result;
    }

    const profiles = profileArgs(args).map((profile) =>
      smokeProfile({ workRoot, tarball: packed.tarball, profile }),
    );
    result = {
      ok: profiles.every((profile) => profile.ok),
      work_root: workRoot,
      kept: keep,
      package_name: packed.package_name,
      package_version: packed.package_version,
      file_count: packed.file_count,
      profiles,
      errors: profiles.flatMap((profile) => profile.errors),
    };
    return result;
  } finally {
    if (!keep) {
      rmSync(workRoot, { recursive: true, force: true });
    }
  }
}

export function runDistribution({ args = [] } = {}) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return { ok: true };
  }

  if (subcommand !== "smoke") {
    console.error(`fail unknown distribution command '${subcommand}'`);
    printHelp();
    return { ok: false };
  }

  const result = runSmoke(rest);
  if (rest.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printResult(result);
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runDistribution({ args: process.argv.slice(2) });
  process.exit(result.ok ? 0 : 2);
}
