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

Use `harness profiles list` to inspect available source profiles before
choosing the init profile.

By default, `harness init` expects the target to be a git repository. Use
`--allow-non-git` only for tests, fixtures, or intentional non-repo targets.

Use `--dry-run` to inspect the install plan without writing files.

Use `--force` only after reviewing local changes. The installer will otherwise
refuse to overwrite existing managed files.

## Upgrade Planning

The profile records a plan-first upgrade policy and exposes:

```bash
harness upgrade --plan
```

The command is read-only. It reports:

- Version source, currently `local-checkout`.
- Installed and available harness versions.
- Installed module state.
- Lock state.
- Managed-file state, including clean, modified, unlocked, and missing files.
- Command wiring state.
- Typed operation records, including safe, review, blocked, and deferred
  operations.
- Actions, warnings, blockers, and notes.

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

## Module Installation

The minimal profile exposes module discovery and installation commands through
the generated manifest:

```bash
harness modules list
harness modules add <module-id>
```

The first mechanically installable follow-on module is
`decisions-open-questions`.

## Current Limits

- The profile does not install Decisions And Open Questions by default.
- Upgrade behavior is plan-only; applying upgrades is not implemented yet.
- Module installation is collision-averse and does not merge existing
  human-authored files.
- File management modes are recorded in `.harness/manifest.yaml`, but merge
  behavior is not implemented yet.
- Lock refresh rebuilds file fingerprints, but semantic diffing and upgrade
  application are not implemented yet.
