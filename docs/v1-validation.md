# V1 Validation And Deferred Scope

Last updated: 2026-06-07

This document is the v1 closeout matrix for the portable harness. It records
what v1 proves, the commands that validate it, and the work intentionally left
outside v1.

## V1 Status

V1 is validated for local packed npm tarball distribution.

The harness can be installed into target git repos from a packed package, can
initialize `minimal` and `full` profiles, can validate installed state with
doctor, can plan upgrades from installed manifest and lock state, and can add
the current installable process-domain modules.

Public npm registry publication is not part of v1 closeout. The guarded publish
workflow exists, but confirmation remains blocked while `package.json` has
`private: true`, `license: UNLICENSED`, or any release-preflight blocker.

## Validation Matrix

| Area | V1 behavior | Validation |
| --- | --- | --- |
| Agent operating contract | `AGENTS.md` establishes boot, status, lock, plans, metadata, distribution, and vocabulary discipline. | `npm run doctor` validates the file and the installed manifest references. |
| Progressive orientation | `index.yaml` and `state/CONTEXT.md` provide a small boot path before deeper docs. | `npm run doctor` validates index references and boot files. |
| Full default install | Bare `harness init` installs the complete `full` profile; `--profile minimal` remains available for bootstrap-only targets. | `npm test` covers default full init, explicit minimal init, doctor, and upgrade plan. |
| Merge-safe init contract | Init preserves existing human-authored content, appends or updates harness-owned sections, and treats `--force` as a compatibility flag rather than overwrite authorization. | `npm test` covers existing `AGENTS.md` preservation, idempotent section updates, dry-run existing-artifact reporting, and no overwrite on `--force`. |
| Destroy lifecycle | `harness destroy` plans teardown without writing; `harness destroy --confirm` creates a sibling backup, removes harness artifacts, preserves `.git/`, and surgically removes marked harness sections from files such as `AGENTS.md` and `.gitignore`. | `npm test` covers read-only planning, JSON planning, confirmed teardown backups, generated-only cleanup, and human-content preservation. |
| Module/profile lifecycle | Source profiles are listable, inspectable, plan-switchable, safely apply-switchable for clean plans, plan-syncable against the active target profile, and safely apply-syncable for clean active-profile module installs; registry modules can be listed and added into target repos with lifecycle backups before writes. | `npm test`, `npm run profiles:list`, `npm run profiles:inspect -- full`, `npm run profiles:switch -- full --plan`, `npm run profiles:switch -- full --apply`, `npm run profiles:sync -- --plan`, `npm run profiles:sync -- --apply`, and `npm run modules:list`. |
| Additional process domains | Structured Metadata, Canonical State, Invariants And Golden Principles, Plans And Status, Durable Memory, Capture And Triage, Application / Corpus Legibility, Reports And Retrieval, Reconciliation And Drift Detection, and Gardening And Entropy Management are installed and dogfooded. Gardening includes configurable threshold validation, read-only action-policy validation, and reviewed action labels in cleanup plans. | `npm run metadata:check`, `npm run state:check`, `npm run invariants:check`, `npm run plans:check`, `npm run memory:check`, `npm run capture:check`, `npm run legibility:check`, `npm run reports:check`, `npm run reconcile:check`, `npm run reconcile:plan`, `npm run garden:check`, `npm run garden:plan`, and `npm run doctor`. |
| Lock and provenance | `.harness/lock.yaml` records fingerprints and semantic provenance; lock drift is detectable. | `npm run lock:check`, `npm run doctor`, and lock/upgrade tests in `npm test`. |
| Rollback planning | `harness rollback --plan` reads lifecycle backup manifests, verifies backup copy hashes, and classifies recovery candidates without restoring files. | `npm test` covers latest-backup selection, specific backup selection, safe missing-file restore candidates, review-required overwrites, corrupted backup blockers, and no-backup blockers. |
| Upgrade planning | Upgrade plan is plan-first, read-only, lock-aware, operation-classified, JSON-capable, and reports installed-instance source/channel guidance plus next operator action. | `npm run upgrade:plan` and `node scripts/harness.mjs upgrade --plan --json`. |
| Safe upgrade apply | Bare `harness upgrade` and `harness upgrade apply` permit safe/noop, safe/refresh-lock, deterministic safe/repair-command, post-v1 profile-bounded safe/install-module, and merge-safe clean safe/update-template-file operations, with lifecycle backups before writes. | `npm test` covers safe apply, bare upgrade apply, clean profile module install backups, command repair backups, merge-safe template cascade apply backups, blocked plans, and review-required refusal. |
| Package boundary | The npm package has an explicit runtime `files` boundary and excludes dogfood/source-local state. | `npm run distribution:check`. |
| Packed-package smoke | The package installs into temporary target repos and validates installed `harness` behavior. Full-profile smoke runs `harness garden plan` as a read-only cleanup preflight. | `npm run distribution:smoke`. |
| Global CLI smoke | The package installs into a temporary global npm prefix and validates bare `harness init`, full-profile `harness garden plan`, plus bare `harness upgrade` from inside a target repo. | `npm run distribution:global-smoke`. |
| External target smoke | A caller-supplied git target is copied into the smoke workspace and validated without mutating the source repo. | `npm test` and `node scripts/harness.mjs distribution smoke --target <path> --profile minimal --force`. |
| Named real-repo smoke | `~/code/meetingly` validates as a named target for both `minimal` and `full` profiles. | `node scripts/harness.mjs distribution smoke --target /Users/julie/code/meetingly --profile minimal --force` and the same command with `--profile full`. |
| Release preflight | Release planning runs package validation and `npm publish --dry-run --json` without publishing. | `npm run distribution:release-plan`; expected v1 status is blocked. |
| Guarded publish planning | Publish planning reports readiness without publishing; confirmation refuses blocked plans. | `npm run distribution:publish-plan`; expected v1 status is blocked. |

## Closeout Command Set

Run this set before claiming the v1 baseline is still healthy:

```bash
node --check scripts/init.mjs
node --check scripts/destroy.mjs
node --check scripts/lifecycle-backup.mjs
node --check scripts/rollback.mjs
node --check scripts/modules.mjs
node --check scripts/profiles.mjs
node --check scripts/capture.mjs
node --check scripts/legibility.mjs
node --check scripts/reports.mjs
node --check scripts/reconcile.mjs
node --check scripts/garden.mjs
node --check scripts/distribution.mjs
node --check scripts/upgrade.mjs
node --check scripts/test.mjs
npm test
npm run profiles:list
npm run profiles:inspect -- full
npm run profiles:switch -- full --plan
npm run profiles:sync -- --plan
npm run profiles:sync -- --apply
npm run metadata:check
npm run state:check
npm run invariants:check
npm run plans:check
npm run capture:check
npm run legibility:check
npm run reports:check
npm run reports:generate
npm run reconcile:check
npm run reconcile:plan
npm run garden:check
npm run garden:plan
npm run memory:check
npm run lock:check
npm run doctor
npm run upgrade:plan
npm run distribution:check
npm run distribution:global-smoke
npm run distribution:release-plan
npm run distribution:publish-plan
npm run distribution:smoke
node scripts/harness.mjs distribution smoke --target /Users/julie/code/meetingly --profile minimal --force
node scripts/harness.mjs distribution smoke --target /Users/julie/code/meetingly --profile full --force
git diff --check
```

Expected v1 release/publish state:

- `distribution:release-plan` exits successfully but reports `status: blocked`.
- `distribution:publish-plan` exits successfully but reports `status: blocked`.
- Blockers are intentional until a release-license and publication decision is
  resumed.

## V1 Behavior Boundary

V1 includes:

- Local packed npm tarball distribution.
- Machine-level global CLI installation from the packed tarball.
- Install, minimal-profile, and v1 validation docs in the package.
- Bare `harness init` full-profile installation plus explicit `minimal` and
  `full` profile installation.
- Registry-backed module listing and module add.
- Dogfooded Decisions And Open Questions, Structured Metadata, Canonical State,
  Invariants And Golden Principles, Plans And Status, Durable Memory, Capture
  And Triage, Application / Corpus Legibility, Reports And Retrieval,
  Reconciliation And Drift Detection, and Gardening And Entropy Management.
- Lock-aware doctor and upgrade planning.
- Limited safe upgrade apply scaffold.
- Lifecycle backups before supported module add, profile switch apply, upgrade
  apply, and confirmed destroy mutations.
- Read-only rollback planning from lifecycle backup manifests.
- Package boundary validation, release preflight, guarded publish planning, and
  external-target smoke.

V1 does not include:

- Public npm registry publication.
- Release license selection.
- Clearing `private: true`.
- Homebrew, Bun, standalone binary, or other distribution channels.
- Full automated file/template upgrade application for human-facing files.
- Full semantic drift detection across arbitrary corpora.
- Deep implementation of every v1 process domain.
- UI, dashboard, or LLM-provider-specific integration.

## Post-V1 Extensions

The first post-v1 upgrade-apply increments are implemented.

`harness upgrade --plan` now emits operation contract version 3. Missing
modules that are required by the target's active profile and pass the same
collision preflight as `harness modules add` are classified as
`safe/install-module`. `harness upgrade apply` installs those modules through
the existing module-add path.

Clean module-template managed files whose source template changed are
classified as `safe/update-template-file` only when the update can be applied
without overwriting human content. `harness upgrade apply` rechecks the target
lock fingerprint and source template fingerprint, applies merge-safe content
updates for merge-managed files, and refreshes the file's lock provenance.

Registry modules that are merely available, but not part of the active
profile, remain `deferred/installable-module-available`. Existing artifact or
command collisions are `review/install-module-collision`, and apply refuses
the whole plan before mutating.

The second post-v1 module/profile lifecycle increment is implemented.

`harness profiles inspect <profile> [--target <path>] [--json]` reports source
profile modules, module metadata, managed files, commands, artifacts, and
installability. When a target manifest is available, it classifies each
profile module as installed, clean-install, review-required, blocked, or
not-inspected without writing files.

The first v1.1 installed-instance upgrade-contract increment is implemented.

Generated target manifests now record `source.install_model:
installed-instance`, package targets record `source.registry_tag`, and upgrade
policy records `upgrade.model: installed-instance`. Upgrade plans emit
`upgrade_guidance` with the repo-local tracking boundary, current source and
channel, next operator action, and private per-repo workflow. The source repo
still does not track installed target repos.

The first v1.1 profile-switching increment is implemented.

`harness profiles switch <profile> --plan [--target <path>] [--json]` builds a
read-only switch plan from the target manifest and source profile. It reuses
module-add preflight, reports clean missing profile modules as safe planned
installs, holds manifest profile updates behind review-required or blocked
module operations, and retains modules outside a smaller requested profile by
default.

The second v1.1 profile-switching increment is implemented.

`harness profiles switch <profile> --apply [--target <path>] [--json]` applies
clean switch plans. It re-runs the plan internally, refuses any plan that
contains a review-required or blocked operation, pre-checks every required
module install before any write, installs each clean missing module through
the existing module-add installer, then mutates the manifest profile and
refreshes lock provenance for `.harness/manifest.yaml`. Modules outside the
requested profile are recorded as `deferred/profile-module-retained` skips and
never uninstalled. `safe/profile-noop` plans succeed as noops.

The first v1.1 profile-sync increment is implemented.

`harness profiles sync --plan [--target <path>] [--json]` builds a read-only
sync plan from the target manifest's active profile. It does not accept an
explicit profile argument and does not switch profiles. It reports installed
active-profile modules as `safe/sync-module-present`, clean missing
active-profile modules as `safe/sync-module-install`, collisions as
`review/sync-module-install-collision`, unavailable required modules as
blocked sync operations, retained modules outside the active profile as
`deferred/profile-module-retained`, and whether the target is already in sync.

The second v1.1 profile-sync increment is implemented.

`harness profiles sync --apply [--target <path>] [--json]` applies clean sync
plans. It re-runs the plan internally, refuses any review-required or blocked
operation, pre-checks every required module install before writing, creates a
lifecycle backup, installs clean missing active-profile modules through the
existing module installer, refreshes lock provenance through that installer,
retains modules outside the active profile, and never switches the target
manifest profile.

The global CLI and merge-safe init increment is implemented.

The packed package can be installed into a global npm prefix and used from any
target repo as `harness`. Bare `harness init` defaults to the `full` profile,
preserves existing human-authored content, and appends or updates marked
harness sections. Bare `harness upgrade` runs the supported safe apply path
after planning internally and refuses blocked or review-required plans.

The Durable Memory process-domain baseline is implemented. The `full` profile
now includes `durable-memory`, which installs `memory/README.md`,
`memory/operator-preferences.yaml`, `memory/repo-notes.md`, and
`memory/session-summaries.md`. `harness memory list/check/report` provide the
first executable behavior and doctor validates the memory module when
installed.

The Capture And Triage process-domain baseline is implemented. The `full`
profile now includes `capture-triage`, which installs `capture/README.md`,
`capture/inbox.yaml`, and `capture/triage.yaml`. `harness capture
list/add/triage/check/report` provide the first executable intake and triage
behavior, and doctor validates the capture module when installed.

The Application / Corpus Legibility process-domain baseline is implemented.
The `full` profile now includes `application-corpus-legibility`, which installs
`legibility/README.md`, `legibility/inventory.yaml`, and
`legibility/notes.md`. `harness legibility list/check/report` provide the
first executable inspection-inventory behavior, and doctor validates the
legibility module when installed.

The Reports And Retrieval process-domain baseline is implemented. The `full`
profile now includes `reports-retrieval`, which installs `reports/README.md`,
`reports/catalog.yaml`, and `reports/snapshots.md`. `harness reports
list/check/report/generate` provide report catalog validation and a lightweight
installed-harness overview, and doctor validates the reports module when
installed.

The Reconciliation And Drift Detection process-domain baseline is implemented.
The `full` profile now includes `reconciliation-drift-detection`, which
installs `reconciliation/README.md`, `reconciliation/rules.yaml`, and
`reconciliation/snapshots.md`. `harness reconcile list/check/report/plan`
provide drift-rule validation and read-only installed-state drift planning, and
doctor validates the reconciliation module when installed.

The Gardening And Entropy Management process-domain baseline is implemented.
The `full` profile now includes `gardening-entropy-management`, which installs
`gardening/README.md`, `gardening/rules.yaml`, and `gardening/snapshots.md`.
`harness garden list/check/report/plan` provide cleanup-rule validation,
configurable threshold validation, action-policy validation, and read-only
cleanup-pressure planning. Doctor validates the gardening module when
installed, and full-profile package smoke runs `harness garden plan` in the
temporary installed target.

The lifecycle backup and rollback planning hardening increments are
implemented.

`harness modules add`, `harness profiles switch --apply`, `harness upgrade` /
`harness upgrade apply`, and `harness destroy --confirm` now create local
backup snapshots before mutating existing files. Normal apply backups live
under `.harness/backups/`; confirmed destroy backups live under
`.harness-destroy-backups/` so they survive removal of `.harness/`. Backup
manifests record copied files, missing paths, skipped paths, SHA-256
fingerprints, purpose, and command metadata.

`harness rollback --plan [--backup <backup-path-or-id>] [--json]` now inspects
those manifests without mutating files. It selects the newest valid backup by
default, verifies copied file hashes, reports safe restore candidates for
missing target files, marks overwrites as review-required, and blocks missing
or corrupted backup copies. Rollback restore/apply remains future work.

## Next Work After V1

Current post-v1 direction lives in
`design/v1.1-installed-instance-roadmap.md`. V1.1 prioritizes standalone
installed-repo upgrade behavior and process-domain depth over public
distribution. The source repo defines the tool; it does not track where the
tool is installed.

The `lock-source-sha-drift-on-module-install` question is resolved; template
source fingerprints are checked against the executing harness source/package.

The strongest remaining v1.1 candidates are:

1. Broaden generated-file, module-definition, merge-aware, and
   review-mediated file/template upgrades while preserving review boundaries.
2. Define rollback restore/apply only after plan-only rollback has enough
   dogfood evidence.

Public publication remains deferred unless a new decision intentionally resumes
release work.
