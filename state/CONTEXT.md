---
title: Harness Context Briefing
generated_on: 2026-05-24
generated_from:
  - design/v1.1-installed-instance-roadmap.md
  - design/v1-product-spec-and-roadmap.md
  - design/v1-process-domain-design.md
  - design/v1-installed-manifest-design.md
  - design/v1-incremental-build-strategy.md
  - design/v1-decisions-open-questions-design.md
  - design/v1-module-profile-installation-design.md
  - design/v1-lock-provenance-design.md
  - design/v1-upgrade-operation-contract.md
  - design/v1-structured-metadata-design.md
  - design/v1-canonical-state-design.md
  - design/v1-invariants-golden-principles-design.md
  - design/v1-plans-status-design.md
  - design/v1-distribution-readiness-design.md
  - spec/agnostic-harness-shape.md
  - spec/portability-model.md
harness:
  package: portable-harness
  version: 0.1.0
  profile: dogfood
---

# Harness Context Briefing

This repo is the source repo and first dogfood target for a portable,
general-purpose agent harness.

The harness should eventually become a CLI-driven infrastructure layer that can
be installed into arbitrary repos - docs, code, mixed workspaces, personal
state, business state, research corpora, or other agent-operable systems.

## Current design baseline

The current product-level baseline is
`design/v1.1-installed-instance-roadmap.md`.

The v1 closeout baseline remains
`design/v1-product-spec-and-roadmap.md` plus `docs/v1-validation.md`.

The process-domain baseline is `design/v1-process-domain-design.md`.

The v1.1 roadmap reorients current work away from public distribution and
toward practical installed-instance behavior for Julie's repos. The harness
source repo defines the tool; it does not track where the tool is installed.
Each target repo owns its local harness state and can inspect, plan, and apply
compatible upgrades by running the current harness tool inside that repo.

V1 defines 15 formal **harness process domains**:

- Agent Operating Contract
- Progressive Orientation
- Canonical State
- Structured Metadata
- Invariants And Golden Principles
- Durable Memory
- Capture And Triage
- Decisions And Open Questions
- Plans And Status
- Application / Corpus Legibility
- Mechanical Validation
- Reconciliation And Drift Detection
- Gardening And Entropy Management
- Reports And Retrieval
- Harness Lifecycle

The exploratory specs under `spec/` remain source material and capability
inventory. They are not binding when they conflict with a formal design.

The v1.1 roadmap and v1 product spec are directional, not canonical sprint
plans. The build strategy is `design/v1-incremental-build-strategy.md`: every
process domain integration should force concrete tooling, and every tooling
improvement should serve a process domain already dogfooded here. The current
second layer is breadth, then depth to the maximum prudent extent, before
adding more breadth. This strategy is local to building this repo, not a
portable process domain. The repo-local gate state is `build/depth-gate.yaml`.

## Dogfood posture

The repo should adopt each process domain incrementally as the harness is
designed and built.

Current dogfood state:

- Agent Operating Contract exists via `AGENTS.md`.
- Plans And Status exists in first dogfood form via `status.md`,
  `plans/current.yaml`, `npm run plans:list`, `npm run plans:check`,
  `npm run plans:report`, status-projection validation, plan-reference
  validation, and doctor validation.
- Progressive Orientation exists in minimal form via `index.yaml` and this
  context briefing.
- Structured Metadata exists in first dogfood form via
  `metadata/artifacts.yaml`, `npm run metadata:list`,
  `npm run metadata:check`, `npm run metadata:report`, filtered list/JSON
  output, dependency-reference validation, and doctor validation.
- Canonical State exists in first dogfood form via
  `state/canonical-state.yaml`, `npm run state:list`,
  `npm run state:check`, `npm run state:report`, role/status/owner-domain
  filters, JSON output, metadata-reference validation, dependency-reference
  validation, and doctor validation.
- Invariants And Golden Principles exists in first dogfood form via
  `invariants/golden-principles.yaml`, `npm run invariants:check`, simple
  file existence/content checks, canonical-state reference validation, and
  doctor validation.
- Harness Lifecycle exists in first dogfood form via `.harness/manifest.yaml`
  and module definitions under `modules/`.
- Mechanical Validation exists in first dogfood form via `npm run doctor` and
  `npm test`; doctor now validates command wiring and the depth gate when
  present.
- The first installer surface exists as `harness init --profile <profile>`,
  exposed locally as `npm run init`; it now reads `profiles/*.yaml` and has
  dry-run, non-git safety, and installed metadata.
- The first upgrade surface exists as `npm run upgrade:plan`; it is read-only,
  uses a `local-checkout` version source in the dogfood repo, reads
  `.harness/lock.yaml`, and reports no blockers or warnings for this dogfood
  repo. It reports `package` as the version source for package-installed
  targets. It now emits typed operation records plus operation summary counts
  so future apply behavior has an explicit safety model. It also emits
  `upgrade_guidance` with the installed-instance model, repo-local tracking
  boundary, current source/channel, next operator action, and private per-repo
  workflow.
  `harness upgrade --plan --json` is the stable machine-readable plan output.
- The first post-v1 apply expansion exists as `npm run upgrade:apply`; it
  permits safe/noop, safe/refresh-lock, deterministic safe/repair-command, and
  clean profile-bounded safe/install-module operations. The first cascade
  apply baseline adds clean safe/update-template-file operations for
  template-backed managed files. Optional registry modules remain deferred,
  and blocked or review-required plans are refused.
- Phase 3 Lock And Provenance exists in baseline form via `.harness/lock.yaml`,
  lock generation during `harness init`, lock refresh during `harness modules
  add`, `harness lock refresh`, `harness lock check`, doctor fingerprint
  validation, semantic provenance fields, and lock-aware upgrade planning.
- The first module/profile installation surface exists via
  `modules/registry.yaml`, `profiles/`, `npm run modules:list`, and
  `node scripts/harness.mjs modules add <module-id> --target <path>`.
- Profiles are now executable install inputs: `npm run profiles:list` lists
  source profiles, and `harness init --profile <profile>` reads
  `profiles/*.yaml` instead of a hardcoded minimal bundle.
- Profile inspection exists via `npm run profiles:inspect -- <profile>` and
  `harness profiles inspect <profile> [--target <path>] [--json]`. It reports
  source profile modules and, for target repos, classifies modules as
  installed, clean-install, review-required, blocked, or not-inspected without
  writing files.
- Profile switch planning exists via
  `harness profiles switch <profile> --plan [--target <path>] [--json]`. It is
  read-only, reuses module-add preflight, plans clean missing requested-profile
  modules as safe installs, blocks or holds profile updates behind unsafe
  module states, and retains modules outside a smaller requested profile by
  default.
- Profile switch apply exists via
  `harness profiles switch <profile> --apply [--target <path>] [--json]`. It
  re-runs switch planning, refuses review-required or blocked operations,
  pre-checks every required module install before any write, installs clean
  missing profile modules, updates the manifest profile only after installs
  succeed, refreshes manifest lock provenance, and retains modules outside the
  requested profile.
- Profile sync planning exists via
  `harness profiles sync --plan [--target <path>] [--json]`. It reads the
  target manifest's active profile, reuses module-add preflight, reports
  installed and clean missing active-profile modules, classifies collisions and
  blockers, retains modules outside the active profile, and keeps sync apply
  deferred.
- `decisions-open-questions` is mechanically installable from the registry into
  a minimal target, and the broad temp-git test matrix now covers clean install,
  collisions, force install, missing source artifacts, doctor, and upgrade
  planning.
- Decisions And Open Questions exists in first dogfood form via `decisions/`,
  `open-questions.yaml`, `templates/decision.md`, and
  `npm run decisions:new -- "<title>"`, `npm run decisions:list`, and
  `npm run questions:list`.
- Distribution Readiness exists in first dogfood form via
  `npm run distribution:check`, which validates explicit npm package contents,
  `npm run distribution:release-plan`, which runs package validation plus
  `npm publish --dry-run --json` and reports publishing as blocked while the
  package is private, and `npm run distribution:smoke`, which packs the local
  npm package, validates package contents, installs it into temporary target
  repos, runs the installed `harness` binary, validates initialized profiles
  with doctor, and confirms package-based upgrade version source plus npm
  registry status reporting. It can also copy a caller-supplied git target into
  the smoke workspace with `--target <path>` and validate the packed package
  without mutating the original target. It now exposes guarded public npm
  publish planning through `npm run distribution:publish-plan`, while publish
  confirmation remains blocked by private/license release blockers.
  External smoke supports `--force` for forced init inside the disposable copy.
  `~/code/meetingly` passed named real-repo smoke for both `minimal` and
  `dogfood` profiles using the packed package and forced init in the copy.
  Actual npm publication is deferred for now; Phase 5 is complete for v1 local
  tarball distribution. `docs/v1-validation.md` records the v1 validation
  matrix, closeout command set, behavior boundary, and deferred-scope summary.
  `docs/install.md` documents local tarball installation.

## Orientation rule

Fresh agents should not crawl the whole repo first.

Read:

1. `AGENTS.md`
2. `status.md`
3. `index.yaml`
4. `state/CONTEXT.md`

Then open the relevant formal design or exploratory spec for the task.

## Near-term work

The first v1.1 installed-instance upgrade-contract increment, profile switch
planning, safe profile switch apply, template source lock-check correction,
clean template cascade apply baseline, and profile sync planning are
implemented. The next useful step is remaining process-domain breadth, paused
for operator confirmation.

Npm publication remains deferred. Distribution smoke remains useful validation
machinery, but public release is not the current product priority.

- Keep `harness doctor` focused on installed harness health plus active module
  validation unless a formal design expands its scope.
- Expand module definitions only when a command needs the additional metadata.
- Use `build/depth-gate.yaml` to confirm the lock/provenance pass before
  selecting the next breadth unit.
- Use `design/v1.1-installed-instance-roadmap.md` as the current product-level
  sequencing reference. Use `design/v1-product-spec-and-roadmap.md` for the v1
  closeout baseline.
- Phase 4 has Structured Metadata, Canonical State, Invariants And Golden
  Principles, and Plans And Status installed as additional process-domain
  modules.
- Structured Metadata now has JSON output, tag/kind/status filtering,
  dependency-reference validation, and report summaries.
- Canonical State now has list/report queries, role/status/owner-domain
  filtering, JSON output, and report summaries.
- Plans And Status now has list/report queries, status/owner/priority
  filtering, JSON output, status-projection validation, plan-reference
  validation, and report summaries.
- Distribution Readiness now has explicit package contents validation, release
  preflight planning, registry discovery, local tarball install docs,
  packed-package smoke validation for package install/init/doctor/upgrade plan,
  copied external-target smoke, forceable init inside copied smoke targets,
  public npm access policy, guarded publish planning, and named `meetingly`
  smoke evidence.
- Next work: pause before the remaining process-domain baselines.
- Keep `status.md` current after significant choices.
