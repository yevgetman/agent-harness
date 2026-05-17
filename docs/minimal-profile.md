# Minimal Install Profile

The `minimal` profile is the first portable install target for the harness.

It installs only enough structure to align agents around a repo-local operating
contract and progressive orientation path.

The profile is defined in `profiles/minimal.yaml`; `harness init --profile
minimal` reads that profile record rather than using a hardcoded module bundle.

## Installed Process Domains

- Agent Operating Contract
- Progressive Orientation

## Installed Files

- `AGENTS.md`
- `status.md`
- `index.yaml`
- `state/CONTEXT.md`
- `.harness/manifest.yaml`
- `.harness/lock.yaml`
- `modules/agent-operating-contract/module.yaml`
- `modules/progressive-orientation/module.yaml`

## Command

```bash
harness init --profile minimal --target <repo>
```

Use `harness profiles list` to list available source profiles before choosing
the init profile. Use `harness profiles inspect <profile>` to inspect a
profile's modules and, when run with `--target <repo>`, classify target module
state before applying missing modules or designing a profile switch.

By default, `harness init` expects the target to be a git repository. Use
`--allow-non-git` only for tests, fixtures, or intentional non-repo targets.

Use `--dry-run` to inspect the install plan without writing files.

When planned harness artifacts already exist, `harness init` warns and refuses
to overwrite them by default. Use `--force` only after reviewing local changes;
forced init definitively overwrites the planned harness artifacts, including
the repo operating contract, orientation files, manifest, lock, and installed
module definitions.

## Upgrade Planning

The profile records a plan-first upgrade policy and exposes:

```bash
harness upgrade --plan
harness upgrade --plan --json
```

The plan command is read-only. The JSON form is the machine-readable upgrade
plan contract. It reports:

- Plan schema and operation contract versions.
- Version source, currently `local-checkout`.
- Installed and available harness versions.
- Installed module state.
- Lock state.
- Managed-file state, including clean, modified, unlocked, and missing files.
- Command wiring state.
- Typed operation records, including safe, review, blocked, and deferred
  operations.
- Operation summary counts by status and code.
- Actions, warnings, blockers, and notes.

The profile also exposes:

```bash
harness upgrade apply
```

The apply surface handles `safe/noop`, `safe/refresh-lock`, deterministic
`safe/repair-command` operations, and clean profile-bounded
`safe/install-module` operations. It refuses blocked or review-required plans.

## Lock Maintenance

The profile records installed-file provenance at `.harness/lock.yaml` and
exposes:

```bash
harness lock check
harness lock refresh
```

Use `harness lock check` to report drift without writing.

Use `harness lock refresh` after intentional edits to harness-managed files.
The refresh command refuses to write when expected manifest, module, or managed
files are missing.

Lock entries include file fingerprints and semantic provenance fields such as
artifact role, owner type, module id, merge strategy, source kind, source path,
and source fingerprint when known.

## Module Installation

The minimal profile exposes module discovery and installation commands through
the generated manifest:

```bash
harness modules list
harness modules add <module-id>
harness profiles inspect <profile>
```

The first mechanically installable follow-on module is
`decisions-open-questions`. `structured-metadata` is also installable and adds
`metadata/artifacts.yaml`, `harness metadata list`, `harness metadata check`,
and `harness metadata report`. `canonical-state` adds
`state/canonical-state.yaml`, `harness state list`, `harness state check`, and
`harness state report`. `invariants-golden-principles` adds
`invariants/golden-principles.yaml` and `harness invariants check`.
`plans-and-status` adds `plans/current.yaml`, `harness plans list`,
`harness plans check`, and `harness plans report`.

Distribution readiness is checked from the source repo with
`npm run distribution:check`, which validates explicit npm package contents,
`npm run distribution:release-plan`, which runs a blocked release preflight,
and `npm run distribution:smoke`, which packs the local npm package and
validates the installed `harness` binary in temporary target repos.

See `docs/install.md` for the local tarball install path.

## Current Limits

- The profile does not install Decisions And Open Questions by default.
- Upgrade apply is intentionally narrow and does not rewrite human-facing
  managed files yet.
- Module installation is collision-averse and does not merge existing
  human-authored files.
- File management modes are recorded in `.harness/manifest.yaml`, but merge
  behavior is not implemented yet.
- Lock refresh rebuilds file fingerprints and semantic provenance, but
  semantic diffing and general file/template upgrade application are not
  implemented yet.
