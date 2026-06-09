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
state before applying missing modules or designing a profile switch. Use
`harness profiles switch <profile> --plan` to get a read-only switch plan for
an installed target.

By default, `harness init` expects the target to be a git repository. Use
`--allow-non-git` only for tests, fixtures, or intentional non-repo targets.

Use `--dry-run` to inspect the install plan without writing files.

Bare `harness init` now defaults to the `full` profile. Use
`harness init --profile minimal` when the target should receive only the
bootstrap harness files. The `full` profile includes the additional process
domain modules, including Durable Memory, Capture And Triage, Application /
Corpus Legibility, Reports And Retrieval, and Reconciliation And Drift
Detection.

When planned harness artifacts already exist, `harness init` preserves existing
human-authored content and adds or updates harness-owned sections where it can
merge safely. If a structured file cannot be merged safely, init refuses
instead of overwriting it. `--force` is accepted for older commands but no
longer authorizes overwriting human-authored content.

## Upgrade Planning

The profile records a plan-first upgrade policy and exposes:

```bash
harness upgrade --plan
harness upgrade --plan --json
harness upgrade
harness rollback --plan
```

The plan command is read-only. The JSON form is the machine-readable upgrade
plan contract. It reports:

- Plan schema and operation contract versions.
- Version source, `local-checkout` for source dogfood and `package` for
  package-installed targets.
- Installed-instance upgrade guidance with source/channel and next operator
  action.
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
harness upgrade
harness upgrade apply
```

The apply surface handles `safe/noop`, `safe/refresh-lock`, deterministic
`safe/repair-command` operations, and clean profile-bounded
`safe/install-module` operations. It also handles clean
`safe/update-template-file` operations for template-backed managed files whose
source template changed and can be merged without overwriting human content.
It refuses blocked or review-required plans. Bare `harness upgrade` runs this
safe apply path after planning internally. Supported apply mutations create a
local backup under `.harness/backups/` before writing existing files.

`harness rollback --plan` inspects lifecycle backup manifests without
restoring files. It selects the newest backup by default, or accepts
`--backup <backup-path-or-id>` for a specific backup.

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
harness profiles switch <profile> --plan
harness profiles sync --plan
harness profiles sync --apply
```

`harness modules add` also creates a local backup under `.harness/backups/`
before writing module artifacts, manifest state, or lock state.

`harness profiles sync --apply` handles only clean plans. It installs missing
modules required by the target manifest's active profile, creates a lifecycle
backup before writes, and refuses review-required or blocked plans.

The first mechanically installable follow-on module is
`decisions-open-questions`. `structured-metadata` is also installable and adds
`metadata/artifacts.yaml`, `harness metadata list`, `harness metadata check`,
and `harness metadata report`. `canonical-state` adds
`state/canonical-state.yaml`, `harness state list`, `harness state check`, and
`harness state report`. `invariants-golden-principles` adds
`invariants/golden-principles.yaml` and `harness invariants check`.
`plans-and-status` adds `plans/current.yaml`, `harness plans list`,
`harness plans check`, and `harness plans report`.
`durable-memory` adds `memory/`, `harness memory list`,
`harness memory check`, and `harness memory report`.
`capture-triage` adds `capture/`, `harness capture list`,
`harness capture add`, `harness capture triage`, `harness capture check`, and
`harness capture report`.
`application-corpus-legibility` adds `legibility/`,
`harness legibility list`, `harness legibility check`, and
`harness legibility report`.
`reports-retrieval` adds `reports/`, `harness reports list`,
`harness reports check`, `harness reports report`, and
`harness reports generate`.
`reconciliation-drift-detection` adds `reconciliation/`,
`harness reconcile list`, `harness reconcile check`,
`harness reconcile report`, and `harness reconcile plan`.
`gardening-entropy-management` adds `gardening/`,
`harness garden list`, `harness garden check`, `harness garden report`, and
`harness garden plan` with configurable cleanup thresholds and read-only
cleanup action policy.

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
- Backup manifests are recovery points; rollback planning is available, but
  rollback restore/apply is not implemented yet.
- Profile switch apply and profile sync apply handle clean plans only; profile
  removal is not implemented yet.
- File management modes are recorded in `.harness/manifest.yaml`, but merge
  behavior is not implemented yet.
- Lock refresh rebuilds file fingerprints and semantic provenance, but
  semantic diffing and general file/template upgrade application are not
  implemented yet.
