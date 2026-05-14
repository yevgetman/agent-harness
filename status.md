# Harness Status

Last updated: 2026-05-14

## Current Phase

Phase 4 Additional Process Domains breadth pass. Structured Metadata is the
first Phase 4 module and is installed in the dogfood repo with metadata
commands, filtered and JSON metadata queries, report summaries, dependency
validation, doctor validation, and `metadata/artifacts.yaml`.

The repo currently has exploratory specs, nine formal v1 documents, a root
agent operating contract, a current-state status projection, a minimal
orientation path with `index.yaml`, a dogfood installed manifest, an installed
lock file, four active module definitions, a runnable `harness doctor`
command, a profile-backed `harness init --profile <profile>` installer, a
repo-local depth gate, and a read-only `harness upgrade --plan` command. The
first module/profile installation surface exists through `modules/registry.yaml`,
`profiles/`, `harness modules list`, `harness modules add <module-id>`,
`harness profiles list`, and profile-backed
`harness init --profile <profile>`, with broad temp-target tests. Decisions And
Open Questions is dogfooded with `decisions/`, `open-questions.yaml`, a
decision template, decision and question list commands, a decision creation
command, and doctor validation. Baseline installed-file provenance exists via
`.harness/lock.yaml`, `harness lock refresh`, `harness lock check`, lock-aware
doctor checks, semantic lock metadata, lock-aware upgrade planning with typed
operation records, JSON plans, operation summaries, and a limited safe
`harness upgrade apply` scaffold. No general file/template upgrade apply,
profile switching, or full external CLI distribution exists yet.

Structured Metadata exists via `metadata/artifacts.yaml`,
`harness metadata list`, `harness metadata check`, `harness metadata report`,
package scripts for local dogfood use, and doctor validation when
`structured-metadata` is installed.

Remote: `git@github.com:yevgetman/agent-harness.git`

Installed harness package: `portable-harness` 0.1.0, profile `dogfood`.

## Current Decisions

- The top-level v1 workflow model is **15 formal harness process domains**, not
  the full 37-item exploratory shape catalog.
- Phase 2 Module And Profile Installation is substantially complete for the v1
  install/list lifecycle; profile switching and profile inspection are deferred
  follow-ons rather than blockers.
- Phase 3 Lock And Provenance is active; the closeout implementation includes
  `.harness/lock.yaml`, semantic provenance fields, JSON plans, and the formal
  upgrade operation contract.
- Phase 4 Additional Process Domains is active; the first breadth unit is
  Structured Metadata.
- `design/v1-product-spec-and-roadmap.md` is the directional product north star
  for v1. It guides sequencing and tradeoffs but does not supersede
  depth-gated incremental development.
- The 37-item shape catalog remains supporting vocabulary and capability
  inventory.
- Canonical term: **harness process domain**. Casual shorthand: **process
  domain**.
- `~/code/harness` is both the harness source repo and the first dogfood target.
- `~/code/me` is deferred until the harness is more mature.
- `status.md` is a current-state projection, not a changelog; agents should edit
  it in place after significant changes.
- Completed feature, process-domain, doc, validation, and tooling changes
  should be committed and pushed unless there is a clear reason to defer remote
  publication.
- Progressive Orientation is the first explicitly dogfooded process domain:
  agents start with `AGENTS.md`, `status.md`, `index.yaml`, and
  `state/CONTEXT.md` before opening deeper docs.
- `index.yaml` is currently an orientation manifest, not yet a mechanically
  enforced document registry.
- Installed harness state is recorded at `.harness/manifest.yaml`.
- Installed-file provenance is recorded at `.harness/lock.yaml`.
- Active module definitions are `agent-operating-contract`,
  `progressive-orientation`, `decisions-open-questions`, and
  `structured-metadata`.
- `modules/registry.yaml` is the source registry for available modules.
  `agent-operating-contract` and `progressive-orientation` are bootstrap
  modules installed by `harness init --profile minimal`;
  `decisions-open-questions` and `structured-metadata` are standalone
  `modules add` installable modules.
- Profiles now exist under `profiles/` for `minimal` and `dogfood`.
- `npm run profiles:list` lists available source profiles and their module
  bundles.
- `npm run doctor` is the first Mechanical Validation surface; it validates
  installed harness health plus Decisions And Open Questions shape when that
  module is installed.
- `npm run init` reads `profiles/*.yaml` and installs the selected profile into
  a target repo. The default `minimal` profile installs `AGENTS.md`,
  `status.md`, `index.yaml`, `state/CONTEXT.md`, `.harness/manifest.yaml`, and
  the two initial module definitions.
- `npm test` covers minimal init, doctor success, overwrite refusal,
  `--force`, unsupported profile failure, decisions/questions, upgrade-plan
  scenarios, and module list/add scenarios.
- `npm run decisions:new -- "<title>"` creates the next decision record under
  `decisions/`.
- GitHub remote is `yevgetman/agent-harness` and is private at creation.
- Short-term build strategy is **incremental tooling plus process-domain
  integration**: each process-domain integration should force concrete tooling,
  and each tooling improvement should serve an already dogfooded domain.
- Second-layer build strategy is **add breadth, then work depth to the maximum
  prudent extent before adding more breadth**. This is specific to building this
  repo and is not a harness process domain or portable default behavior.
- `build/depth-gate.yaml` records the repo-local depth gate. `npm run doctor`
  validates it when present.
- `npm run init` now supports `--dry-run`, refuses non-git targets unless
  `--allow-non-git` is passed, reports install plans, and writes package,
  version, and profile metadata into generated files.
- `npm run doctor` now groups diagnostics, deduplicates repeated file checks,
  emits remediation hints, validates `index.yaml` dependencies, checks command
  availability, checks depth-gate shape, and checks manifest/module
  managed-file consistency.
- `npm run upgrade:plan` reports installed harness state without applying
  changes.
- The upgrade planner uses the explicit v1 version source `local-checkout`.
- The upgrade planner reports plan schema, operation contract version, modules,
  registry-available modules, managed files, lock state, command wiring, typed
  operations, operation summaries, actions, warnings, blockers, and notes.
- `node scripts/harness.mjs upgrade --plan --json` emits stable
  machine-readable upgrade plans.
- The dogfood repo's current upgrade plan reports no blockers or warnings.
- Dogfood managed files now include harness-management markers.
- `harness init` writes `.harness/lock.yaml` for installed non-directory
  artifacts.
- `harness modules add <module-id>` updates `.harness/lock.yaml` for module
  artifacts and `.harness/manifest.yaml`.
- `npm run lock:refresh` rebuilds `.harness/lock.yaml` from the installed
  manifest and current installed files.
- `npm run lock:check` reports lock drift without writing.
- `npm run doctor` validates lock shape, locked-file presence, and fingerprint
  drift.
- `npm run upgrade:plan` uses lock fingerprints to distinguish clean, modified,
  unlocked, and missing managed files.
- `npm run upgrade:plan` now emits operation records such as `safe/noop`,
  `safe/refresh-lock`, `review/modified-managed-file`,
  `blocked/missing-managed-file`, and `deferred/apply-not-implemented`.
- `npm run upgrade:apply` is a safe scaffold that only permits `safe/noop`,
  `safe/refresh-lock`, and deterministic `safe/repair-command` operations and
  refuses blocked or review-required plans.
- Lock entries now preserve semantic provenance fields including
  `artifact_role`, `owner_type`, `module_id`, `merge_strategy`, `source_kind`,
  optional `source_path`, and optional `source_sha256`.
- `npm run decisions:list` lists decision records.
- `npm run questions:list` lists open questions.
- `npm run metadata:list` lists structured artifact metadata.
- `npm run metadata:check` validates `metadata/artifacts.yaml`.
- `npm run metadata:report` summarizes metadata by status, kind, and tag.
- `harness metadata list` supports tag, kind, status, and JSON output filters.
- `npm run modules:list` lists registry modules with installed/installable
  state.
- `node scripts/harness.mjs modules add <module-id> --target <path>` installs
  the first registry-backed modules into a target manifest.
- Module install tests cover clean install, collision refusal, force install,
  unknown module failure, bootstrap module no-op, missing source template
  preflight, structured metadata install, doctor after install, and upgrade
  plan after install.
- Profile-backed init tests cover profile listing, minimal profile init, and
  dogfood profile init into real temp git targets.
- `build/depth-gate.yaml` records `structured-metadata-query-validation` as the
  current complete depth pass for the first Phase 4 breadth unit.

## Active Artifacts

- `AGENTS.md` — current agent operating contract for this repo.
- `index.yaml` — current orientation manifest and reading order.
- `state/CONTEXT.md` — condensed context briefing for fresh agents.
- `design/v1-product-spec-and-roadmap.md` — formal directional v1 product spec
  and roadmap.
- `design/v1-process-domain-design.md` — formal v1 process-domain design
  baseline.
- `design/v1-installed-manifest-design.md` — formal installed-manifest design
  baseline.
- `design/v1-incremental-build-strategy.md` — formal short-term build strategy.
- `design/v1-decisions-open-questions-design.md` — formal Decisions And Open
  Questions domain design.
- `design/v1-module-profile-installation-design.md` — formal module/profile
  installation design.
- `design/v1-lock-provenance-design.md` — formal Lock And Provenance design.
- `design/v1-upgrade-operation-contract.md` — formal Upgrade Operation
  Contract design.
- `design/v1-structured-metadata-design.md` — formal Structured Metadata
  design.
- `build/depth-gate.yaml` — repo-local depth gate for the current build
  methodology.
- `docs/minimal-profile.md` — reference for the current minimal install
  profile.
- `.harness/manifest.yaml` — dogfood installed harness manifest.
- `.harness/lock.yaml` — dogfood installed-file provenance lock.
- `metadata/artifacts.yaml` — dogfood structured artifact metadata registry.
- `modules/*/module.yaml` — active module definitions.
- `open-questions.yaml` — structured unresolved questions.
- `decisions/0001-adopt-decisions-and-open-questions-domain.md` — first
  dogfood decision record, created with the new decisions command.
- `decisions/0002-adopt-depth-gate-and-plan-first-upgrade-surface.md` —
  decision record for depth-gate validation and plan-first upgrade planning.
- `decisions/0003-adopt-product-spec-and-roadmap-as-directional-v1-north-star.md`
  — decision record for adding the product spec and roadmap as product-level
  guidance.
- `decisions/0004-adopt-registry-backed-module-installation-surface.md` —
  decision record for adding the source registry, profile records, and first
  module install commands.
- `decisions/0005-adopt-profile-backed-init-and-profile-listing.md` —
  decision record for profile listing and profile-backed init.
- `decisions/0006-adopt-installed-lock-provenance.md` — decision record for the
  initial lock/provenance artifact.
- `decisions/0007-adopt-safe-upgrade-apply-scaffold.md` — decision record for
  the limited safe upgrade apply scaffold.
- `decisions/0008-adopt-upgrade-operation-contract-closeout.md` — decision
  record for the formal operation contract, JSON plans, semantic provenance,
  and safe command repair.
- `decisions/0009-adopt-structured-metadata-as-first-phase-4-module.md` —
  decision record for adopting Structured Metadata as the first Phase 4 module.
- `decisions/0010-deepen-structured-metadata-query-and-validation.md` —
  decision record for filtered metadata queries, JSON output, report summaries,
  and dependency validation.
- `modules/registry.yaml` — source registry of modules available to list or
  install.
- `profiles/minimal.yaml` / `profiles/dogfood.yaml` — current profile bundle
  definitions.
- `scripts/harness.mjs` / `scripts/init.mjs` / `scripts/decisions.mjs` /
  `scripts/questions.mjs` / `scripts/modules.mjs` / `scripts/upgrade.mjs` /
  `scripts/profiles.mjs` / `scripts/metadata.mjs` / `scripts/lock.mjs` /
  `scripts/doctor.mjs` —
  harness CLI, installer, decision/question commands, module/profile commands,
  metadata commands, lock command/helpers, upgrade planner, and doctor command.
- `scripts/test.mjs` — executable tests for init, doctor, decisions, questions,
  modules, semantic lock provenance, upgrade planning/apply behavior,
  depth-gate validation, and doctor fixtures.
- `fixtures/doctor/` — negative-path doctor fixtures.
- `spec/agnostic-harness-shape.md` — exploratory catalog of harness process
  domains and supporting capabilities.
- `spec/portability-model.md` — exploratory portability model and install
  sketch.

## Next Work

- Decide whether Structured Metadata is deep enough for the next Phase 4
  breadth unit. Remaining depth candidates include cycle detection, generated
  reports on disk, and metadata discovery/scanning.
- Keep the current strategy: add breadth only when it forces concrete tooling,
  then deepen it before adding more breadth.

## Open Questions

- See `open-questions.yaml`.
