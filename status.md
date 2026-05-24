# Harness Status

Last updated: 2026-05-24

## Current Phase

V1 is complete for local-tarball distribution. The active product direction is
now **v1.1 installed instance harness**: a practical, durable, portable tool
that can be installed into Julie's repos, set up their local harness process
domains, and let each installed repo inspect, plan, and safely receive
compatible upgrades by running the current harness tool in that repo. The
source repo defines the tool; it is not a command center and does not track
where the harness is installed. The v1.1 baseline lives in
`design/v1.1-installed-instance-roadmap.md`; the v1 closeout validation matrix
and deferred-scope baseline remain in `docs/v1-validation.md`.

Distribution is supporting validation machinery for v1.1, not the product
priority. Packed-package smoke, package-boundary validation, release preflight
planning, registry version discovery, external-target smoke, forceable
external-smoke init, guarded publish planning, and named `meetingly` smoke all
exist. Public npm publication and the release-license decision remain deferred.
The v1.1 installed-instance upgrade contract now has a narrow baseline:
manifests record installed-instance source/channel metadata, upgrade plans emit
`upgrade_guidance`, and install docs describe the private per-repo operator
flow. The first profile-switching increment added
`harness profiles switch <profile> --plan`; the second adds safe profile switch
apply for clean plans (`harness profiles switch <profile> --apply`), which
installs required modules, updates the manifest profile only after installs
succeed, refreshes lock provenance, retains modules outside the requested
profile, and refuses review-required or blocked plans. The first cascade
apply baseline now handles clean module-template managed-file updates through
`harness upgrade apply`. Profile sync planning now exists through
`harness profiles sync --plan`. The next v1.1 build step is process-domain
breadth, paused for operator confirmation.

The repo currently has exploratory specs, thirteen formal v1 documents, a root
agent operating contract, a current-state status projection, a minimal
orientation path with `index.yaml`, a dogfood installed manifest, an installed
lock file, seven active module definitions, a runnable `harness doctor`
command, a profile-backed `harness init --profile <profile>` installer, a
repo-local depth gate, and a read-only `harness upgrade --plan` command. The
first module/profile installation surface exists through `modules/registry.yaml`,
`profiles/`, `harness modules list`, `harness modules add <module-id>`,
`harness profiles list`, `harness profiles inspect <profile>`,
`harness profiles switch <profile> --plan`,
`harness profiles switch <profile> --apply`,
`harness profiles sync --plan`, and profile-backed init, with broad
temp-target tests. Decisions And
Open Questions is dogfooded with `decisions/`, `open-questions.yaml`, a
decision template, decision and question list commands, a decision creation
command, and doctor validation. Baseline installed-file provenance exists via
`.harness/lock.yaml`, `harness lock refresh`, `harness lock check`, lock-aware
doctor checks, semantic lock metadata, lock-aware upgrade planning with typed
operation records, JSON plans, operation summaries, and a limited safe
`harness upgrade apply` surface. The first post-v1 upgrade-apply increment is
implemented: upgrade plans now emit operation contract version 3,
profile-bounded `safe/install-module` operations for clean missing active
profile modules, and `safe/update-template-file` operations for clean
outdated module-template managed files, while optional registry modules remain
deferred and collisions remain review-required. The second post-v1 increment adds
`harness profiles inspect <profile> [--target <path>] [--json]` for read-only
profile module, target-state, and module-install preflight inspection before
profile switching. The first profile-switching increment adds
`harness profiles switch <profile> --plan [--target <path>] [--json]` for
read-only switch plans that reuse module-add preflight, classify clean missing
modules as safe planned installs, hold profile updates behind review-required
or blocked modules, and retain modules outside a smaller requested profile by
default. The second profile-switching increment adds
`harness profiles switch <profile> --apply [--target <path>] [--json]` for
clean switch plans: apply re-runs the plan, refuses any review or blocker,
pre-checks every required install before any write, installs each clean module
through the existing module-add installer, updates the manifest profile only
after installs succeed, refreshes lock provenance for the manifest, and
records retained modules as `deferred/profile-module-retained` skips.
Profile sync planning now adds
`harness profiles sync --plan [--target <path>] [--json]` for read-only active
profile alignment checks: it loads the target's manifest profile, classifies
installed, clean missing, review-required, and blocked active-profile modules,
reports retained modules outside the active profile, and records sync apply as
deferred.
Local packed-package distribution smoke, explicit npm
package-boundary validation, release preflight planning, registry version
discovery, external-target smoke, forceable external-smoke init, guarded
publish planning, and named real-repo smoke exist. Npm publication and the
release-license decision are intentionally deferred. General generated-file,
module-definition, merge-aware, and review-mediated file/template upgrade
apply, profile sync apply, profile removal, and non-npm distribution do not
exist yet. The
`lock-source-sha-drift-on-module-install` open question is resolved: lock
refresh/check now resolves template source fingerprints from the executing
harness source/package root, and composed apply commands keep JSON output
machine-readable while installing modules.
The current v1 baseline and post-v1 extensions are documented in
`docs/v1-validation.md`; current v1.1 direction is documented in
`design/v1.1-installed-instance-roadmap.md`.

Structured Metadata exists via `metadata/artifacts.yaml`,
`harness metadata list`, `harness metadata check`, `harness metadata report`,
package scripts for local dogfood use, and doctor validation when
`structured-metadata` is installed. Canonical State exists via
`state/canonical-state.yaml`, `harness state list`, `harness state check`,
`harness state report`, local package scripts, and doctor validation when
`canonical-state` is installed. Invariants And Golden Principles exists via
`invariants/golden-principles.yaml`, `harness invariants check`, the local
`npm run invariants:check` script, and doctor validation when
`invariants-golden-principles` is installed. Plans And Status exists via
`plans/current.yaml`, `harness plans list`, `harness plans check`,
`harness plans report`, local package scripts, and doctor validation when
`plans-and-status` is installed. Distribution Readiness exists via
`harness distribution check`, `npm run distribution:check`,
`harness distribution release --plan`, `npm run distribution:release-plan`,
`harness distribution smoke`, `npm run distribution:smoke`, an explicit package
`files` boundary, install docs, package-based upgrade version-source reporting,
package-installed registry status reporting, release preflight blockers while
the package is private, packed-package smoke validation for the `minimal` and
`dogfood` profiles, copied external-target smoke validation, forced init inside
copied smoke targets, public npm access policy, guarded publish planning, and
named `meetingly` smoke evidence.

Remote: `git@github.com:yevgetman/agent-harness.git`

Installed harness package: `portable-harness` 0.1.0, profile `dogfood`.

## Current Decisions

- The top-level v1 workflow model is **15 formal harness process domains**, not
  the full 37-item exploratory shape catalog.
- Phase 2 Module And Profile Installation is substantially complete for the v1
  install/list lifecycle; profile inspection, profile switch planning, and safe
  profile switch apply are implemented as post-v1 follow-ons.
- Phase 3 Lock And Provenance is active; the closeout implementation includes
  `.harness/lock.yaml`, semantic provenance fields, JSON plans, and the formal
  upgrade operation contract.
- Phase 4 Additional Process Domains has Structured Metadata, Canonical State,
  Invariants And Golden Principles, and Plans And Status installed as breadth
  units.
- Phase 5 Distribution Readiness is complete for v1; packed-package smoke
  validation, explicit npm package-boundary validation, release preflight
  planning, registry version discovery, external-target smoke, guarded publish
  planning, forceable external-smoke init, and named real-repo smoke are
  implemented. Actual npm publication is deferred for now.
- `docs/v1-validation.md` is the v1 closeout validation and deferred-scope
  baseline; the first post-v1 upgrade-apply increment and first v1.1
  installed-instance upgrade-contract increment are now implemented.
- `design/v1.1-installed-instance-roadmap.md` is the current product direction:
  standalone installed-repo upgrade behavior, profile switching, remaining
  process-domain baselines, dogfood robustness, and real-repo evidence. Public
  publication is not the active priority.
- `design/v1-product-spec-and-roadmap.md` is the directional product north star
  for v1 closeout. It remains relevant context but no longer drives current
  post-v1 sequencing.
- The 37-item shape catalog remains supporting vocabulary and capability
  inventory.
- Canonical term: **harness process domain**. Casual shorthand: **process
  domain**.
- `~/code/harness` is both the harness source repo and the first dogfood target.
- `~/code/me` is deferred until the harness is more mature.
- `~/code/meetingly` remains the first named real-repo smoke target; v1.1
  should continue validating against copied real repos without creating a
  source-owned registry of installations.
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
  `progressive-orientation`, `decisions-open-questions`,
  `structured-metadata`, `canonical-state`, and
  `invariants-golden-principles`, and `plans-and-status`.
- `modules/registry.yaml` is the source registry for available modules.
  `agent-operating-contract` and `progressive-orientation` are bootstrap
  modules installed by `harness init --profile minimal`;
  `decisions-open-questions`, `structured-metadata`, `canonical-state`, and
  `invariants-golden-principles`, and `plans-and-status` are standalone
  `modules add` installable modules.
- Profiles now exist under `profiles/` for `minimal` and `dogfood`.
- `npm run profiles:list` lists available source profiles and their module
  bundles.
- `npm run profiles:inspect -- <profile>` inspects source profile modules and,
  with `--target <path>`, classifies target module state as installed,
  clean-install, review-required, blocked, or not-inspected.
- `npm run profiles:switch -- <profile> --plan` plans a profile switch for an
  installed target without writing files.
- `npm run profiles:sync -- --plan` plans active-profile alignment for an
  installed target without writing files.
- `npm run doctor` is the first Mechanical Validation surface; it validates
  installed harness health plus Decisions And Open Questions shape when that
  module is installed.
- `npm run init` reads `profiles/*.yaml` and installs the selected profile into
  a target repo. The default `minimal` profile installs `AGENTS.md`,
  `status.md`, `index.yaml`, `state/CONTEXT.md`, `.harness/manifest.yaml`, and
  the two initial module definitions.
- `npm test` covers minimal init, doctor success, overwrite refusal,
  `--force`, unsupported profile failure, profile inspection, profile switch
  plan/apply, profile sync planning, decisions/questions, upgrade-plan
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
- The upgrade planner uses the explicit v1 version source `local-checkout` for
  the dogfood repo and reports `package` for package-installed targets.
- For package-installed targets, the upgrade planner reports npm registry
  discovery status under `version_source.registry` and uses a discovered
  registry version as `available_harness_version` when one is available.
- `npm run upgrade:plan` emits `upgrade_guidance` with the installed-instance
  model, repo-local tracking boundary, current source/channel, next operator
  action, and private per-repo workflow.
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
  `safe/refresh-lock`, profile-bounded `safe/install-module`,
  `safe/update-template-file`,
  `review/modified-managed-file`, `review/install-module-collision`,
  `blocked/missing-managed-file`, and `deferred/apply-not-implemented`.
- `npm run upgrade:apply` permits `safe/noop`, `safe/refresh-lock`,
  deterministic `safe/repair-command`, clean profile-bounded
  `safe/install-module`, and clean `safe/update-template-file` operations
  while refusing blocked or review-required plans.
- Lock entries now preserve semantic provenance fields including
  `artifact_role`, `owner_type`, `module_id`, `merge_strategy`, `source_kind`,
  optional `source_path`, and optional `source_sha256`.
- `npm run decisions:list` lists decision records.
- `npm run questions:list` lists open questions.
- `npm run metadata:list` lists structured artifact metadata.
- `npm run metadata:check` validates `metadata/artifacts.yaml`.
- `npm run metadata:report` summarizes metadata by status, kind, and tag.
- `harness metadata list` supports tag, kind, status, and JSON output filters.
- `npm run state:list` lists canonical state entries.
- `npm run state:check` validates `state/canonical-state.yaml`.
- `npm run state:report` summarizes canonical state by role, status, owner
  domain, and refresh mode.
- `npm run invariants:check` validates `invariants/golden-principles.yaml` and
  runs active invariant checks.
- `npm run plans:list` lists structured plan/status entries.
- `npm run plans:check` validates `plans/current.yaml`.
- `npm run plans:report` summarizes plans by status, priority, and owner
  domain.
- `npm run distribution:check` validates explicit npm package contents with
  `npm pack --dry-run --json`.
- `npm run distribution:release-plan` validates package contents, runs
  `npm publish --dry-run --json`, and reports registry publication as blocked
  while the package is private.
- `npm run distribution:publish-plan` reports public npm publish readiness
  without publishing; `harness distribution publish --confirm` refuses to
  publish while release blockers remain.
- `npm run distribution:smoke` packs the local npm package, validates package
  contents, and validates the installed harness binary in temporary target
  repos.
- `node scripts/harness.mjs distribution smoke --target <path>` validates a
  copied external git target without mutating the original target path.
- Package-installed distribution smoke validates that upgrade planning reports
  package source and registry status without adding warnings or blockers for an
  unpublished/private package.
- `npm run modules:list` lists registry modules with installed/installable
  state.
- `node scripts/harness.mjs modules add <module-id> --target <path>` installs
  the first registry-backed modules into a target manifest.
- Module install tests cover clean install, collision refusal, force install,
  unknown module failure, bootstrap module no-op, missing source template
  preflight, structured metadata, canonical state, invariants install, plans
  install, doctor after install, and upgrade plan after install.
- Profile tests cover profile listing, source-only inspect, target inspect,
  JSON inspect, unsupported profile failure, collision classification, minimal
  profile init, and dogfood profile init into real temp git targets.
- `build/depth-gate.yaml` records `post-v1-profile-inspection` as the current
  complete depth pass.
- `~/code/meetingly` has passed distribution smoke for both `minimal` and
  `dogfood` profiles with forced init in a copied target; the original repo was
  not mutated.
- `plans/current.yaml` records profile inspection complete, v1.1 installed
  instance roadmap adoption complete, and installed-instance upgrade-contract
  work active while npm publication remains deferred.

## Active Artifacts

- `AGENTS.md` — current agent operating contract for this repo.
- `index.yaml` — current orientation manifest and reading order.
- `state/CONTEXT.md` — condensed context briefing for fresh agents.
- `design/v1.1-installed-instance-roadmap.md` — current v1.1 product spec and
  roadmap for standalone installed-repo upgrade behavior.
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
- `design/v1-canonical-state-design.md` — formal Canonical State design.
- `design/v1-invariants-golden-principles-design.md` — formal Invariants And
  Golden Principles design.
- `design/v1-plans-status-design.md` — formal Plans And Status design.
- `design/v1-distribution-readiness-design.md` — formal Distribution
  Readiness design.
- `build/depth-gate.yaml` — repo-local depth gate for the current build
  methodology.
- `docs/minimal-profile.md` — reference for the current minimal install
  profile.
- `docs/install.md` — local tarball install guide and package-boundary note.
- `docs/v1-validation.md` — v1 validation matrix, closeout command set,
  behavior boundary, and deferred-scope summary.
- `.harness/manifest.yaml` — dogfood installed harness manifest.
- `.harness/lock.yaml` — dogfood installed-file provenance lock.
- `metadata/artifacts.yaml` — dogfood structured artifact metadata registry.
- `state/canonical-state.yaml` — dogfood canonical state authority registry.
- `invariants/golden-principles.yaml` — dogfood checked invariants and golden
  principles registry.
- `plans/current.yaml` — dogfood structured plans and status registry.
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
- `decisions/0011-adopt-canonical-state-as-second-phase-4-module.md` —
  decision record for adopting Canonical State as the second Phase 4 module.
- `decisions/0012-deepen-canonical-state-query-and-reporting.md` — decision
  record for Canonical State list/report queries and JSON output.
- `decisions/0013-adopt-invariants-and-golden-principles-module.md` —
  decision record for adopting Invariants And Golden Principles as a Phase 4
  module.
- `decisions/0014-adopt-plans-and-status-module.md` — decision record for
  adopting Plans And Status as a Phase 4 module.
- `decisions/0015-adopt-distribution-readiness-smoke-test.md` — decision
  record for adopting packed-package distribution smoke validation.
- `decisions/0016-adopt-explicit-npm-package-boundary.md` — decision record
  for adopting an explicit npm package boundary and contents check.
- `decisions/0017-adopt-release-preflight-plan.md` — decision record for
  adopting a blocked release preflight plan before publish automation.
- `decisions/0018-adopt-registry-version-discovery.md` — decision record for
  adopting npm registry version discovery in package-installed upgrade plans.
- `decisions/0019-adopt-external-target-distribution-smoke.md` — decision
  record for adopting copied external-target distribution smoke validation.
- `decisions/0020-adopt-guarded-npm-publish-workflow.md` — decision record for
  adopting public npm access policy and guarded publish planning.
- `decisions/0021-adopt-forceable-external-smoke-init.md` — decision record
  for explicit forced init overwrite semantics and forceable external smoke.
- `decisions/0022-close-phase-5-with-local-tarball-distribution.md` — decision
  record for closing Phase 5 with local tarball distribution while registry
  publication remains deferred.
- `decisions/0023-adopt-v1-validation-and-deferred-scope-baseline.md` —
  decision record for adopting the v1 validation matrix and deferred-scope
  baseline.
- `decisions/0024-adopt-profile-bounded-safe-module-install-apply.md` —
  decision record for operation contract version 2 and clean active-profile
  module installs through `harness upgrade apply`.
- `decisions/0025-adopt-profile-inspection-before-profile-switching.md` —
  decision record for adding read-only profile inspection before profile
  switching.
- `decisions/0026-adopt-v1-1-private-fleet-cascade-roadmap.md` — decision
  record for the superseded private fleet and cascading-upgrade roadmap.
- `decisions/0027-adopt-standalone-installed-instance-upgrade-model.md` —
  decision record for adopting the standalone installed-instance upgrade model.
- `decisions/0028-adopt-plan-first-profile-switch-planning.md` — decision
  record for adding read-only profile switch planning.
- `decisions/0029-adopt-safe-profile-switch-apply.md` — decision record for
  adding safe profile switch apply for clean plans.
- `decisions/0030-use-harness-source-root-for-template-lock-checks.md` —
  decision record for checking template source locks against the executing
  harness source root.
- `decisions/0031-adopt-safe-template-cascade-apply-baseline.md` — decision
  record for operation contract version 3 and clean module-template cascade
  apply.
- `decisions/0032-adopt-plan-first-profile-sync-planning.md` — decision record
  for adding read-only active-profile sync planning.
- `modules/registry.yaml` — source registry of modules available to list or
  install.
- `profiles/minimal.yaml` / `profiles/dogfood.yaml` — current profile bundle
  definitions.
- `scripts/harness.mjs` / `scripts/init.mjs` / `scripts/decisions.mjs` /
  `scripts/questions.mjs` / `scripts/modules.mjs` / `scripts/upgrade.mjs` /
  `scripts/profiles.mjs` / `scripts/metadata.mjs` / `scripts/lock.mjs` /
  `scripts/state.mjs` / `scripts/invariants.mjs` / `scripts/plans.mjs` /
  `scripts/distribution.mjs` / `scripts/doctor.mjs` —
  harness CLI, installer, decision/question commands, module/profile commands,
  metadata commands, canonical state validation, invariants validation, plans
  validation and reporting, distribution contents/smoke/external-target/publish
  validation, lock command/helpers, registry-aware upgrade planner, and doctor
  command.
- `scripts/test.mjs` — executable tests for init, doctor, decisions, questions,
  modules, structured metadata, canonical state, invariants, plans/status,
  distribution package contents and smoke validation, semantic lock provenance,
  registry discovery, external-target smoke, guarded publish workflow, upgrade
  planning/apply behavior, depth-gate validation, and doctor fixtures.
- `fixtures/doctor/` — negative-path doctor fixtures.
- `spec/agnostic-harness-shape.md` — exploratory catalog of harness process
  domains and supporting capabilities.
- `spec/portability-model.md` — exploratory portability model and install
  sketch.

## Next Work

- Pause before starting the next process-domain breadth increment.
- The next likely breadth unit is one of the remaining process-domain baselines
  from `design/v1.1-installed-instance-roadmap.md`.
- Keep npm publication deferred; do not clear `private: true` or `UNLICENSED`
  unless a new decision intentionally resumes public release work.
- Keep the current strategy: add breadth only when it forces concrete tooling,
  then deepen it before adding more breadth.

## Open Questions

- See `open-questions.yaml`.
