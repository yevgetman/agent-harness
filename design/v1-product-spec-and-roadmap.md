# Formal Product Spec: V1 Portable Agent Harness

**Status:** accepted directional baseline  
**Date:** 2026-05-14  
**Scope:** product intent, v1 success criteria, roadmap, and sequencing rules  
**Relationship to build strategy:** directional, not a canonical task plan

This is a formal product document. It sits above subsystem design documents and
below the repo-local operating contract.

It should guide sequencing and tradeoffs, but it does not supersede
depth-gated incremental development.

## Product Intent

Build a portable, general-purpose agent harness that can be installed into any
agent-operable repository: code, documentation, mixed workspaces, personal
state, business state, research corpora, or other durable work surfaces.

The harness should align agents to a coherent workflow by installing and
maintaining process domains, repo-local operating contracts, orientation
artifacts, validation commands, and lifecycle metadata.

The product should be agnostic to repo content. It must work for:

- document harnesses
- codebases
- mixed code/document repos
- personal-scope repos
- business-scope repos
- research or corpus repos
- other durable agent-operable workspaces

The product is inspired by harness architecture rather than a narrow document
template. A harness is the combination of process domains, artifacts, commands,
metadata, and agent instructions that make a repo legible and governable by
agents over time.

The initial personal-scope use case remains a motivating target, but it is
deferred until the portable harness itself is mature enough to install and
maintain that repo cleanly.

## Product Shape

The harness should behave like a combination of:

- a CLI tool
- an installable repo scaffold
- a manifest-driven module system
- an agent skill or operating manual
- a lifecycle manager for process-domain artifacts

Some setup should be mechanical:

- create files
- write manifests
- install module definitions
- wire commands
- validate structure
- plan upgrades

Some setup should be agent-mediated:

- interpret target repo purpose
- write repo-specific context
- tune operating instructions
- decide which process domains matter
- promote rough notes into durable artifacts
- resolve conflicts during upgrade planning

The goal is not merely to copy templates into a repo. The goal is to align
future agents to a workflow that remains legible, updateable, and extensible.

## V1 Outcome

V1 is successful when the harness can be installed into a fresh target repo and
provide:

- A clear agent operating contract.
- A progressive orientation path.
- Installed harness metadata.
- A minimal process-domain profile.
- A mechanism to add or update process-domain modules.
- Deterministic validation through `harness doctor`.
- Plan-first upgrade behavior.
- Durable decisions and open-question tracking.
- Enough provenance or lock state to make upgrades safe to plan.
- Documentation that explains how the installed workflow is produced by the
  active process domains.
- A clear boundary between portable harness behavior and target-repo-specific
  strategy layers.

V1 does not need to solve every process domain deeply. It must prove the
portable installation, validation, module, and upgrade loop.

## Product Principles

- **Portable first:** no assumption that the target repo is a document set, code
  repo, or personal repo.
- **Agent-legible by default:** fresh agents should understand where to start,
  what is authoritative, and what not to touch.
- **Progressive disclosure:** boot paths should be small; deeper context should
  be discoverable through manifests and reading order.
- **Plan before mutate:** installation and upgrade behavior should prefer
  explicit plans, conflicts, and review points over blind overwrites.
- **Dogfood every increment:** harness behavior should be installed in this repo
  as soon as it exists.
- **Depth before breadth:** add narrow breadth, then deepen it until more polish
  is less valuable than the next breadth increment.
- **Extensible process domains:** domains should be installable, upgradable, and
  replaceable through modules and profiles.
- **Cascading improvement:** improvements to modules, templates, validators, or
  instructions should be able to flow into installed repos through future
  upgrade planning.
- **Human judgment boundary:** the harness should make agent work safer and more
  coherent, not pretend all judgment can be automated.
- **Current state over transcript:** status projections and manifests should
  orient future agents without becoming unbounded changelogs.

## Non-Goals For V1

- Full semantic drift detection across arbitrary corpora.
- Fully automated upgrade application for conflicting human-facing files.
- External distribution across every packaging channel.
- A complete implementation of all 15 process domains.
- Rich UI or web dashboard.
- LLM-provider-specific integrations.
- Replacing repo-specific human judgment with rigid global policy.

## Current Product Surface

Current commands:

- `harness init --profile <profile>`
- `harness doctor`
- `harness decisions new`
- `harness decisions list`
- `harness questions list`
- `harness modules list`
- `harness modules add <module>`
- `harness profiles list`
- `harness metadata list`
- `harness metadata check`
- `harness metadata report`
- `harness state list`
- `harness state check`
- `harness state report`
- `harness invariants check`
- `harness plans list`
- `harness plans check`
- `harness plans report`
- `harness distribution check`
- `harness distribution release --plan`
- `harness distribution publish --plan`
- `harness distribution smoke`
- `harness lock refresh`
- `harness lock check`
- `harness upgrade --plan`
- `harness upgrade --plan --json`
- `harness upgrade apply`

Current dogfood modules:

- `agent-operating-contract`
- `progressive-orientation`
- `decisions-open-questions`
- `structured-metadata`
- `canonical-state`
- `invariants-golden-principles`
- `plans-and-status`

Current repo-local build support:

- `build/depth-gate.yaml`

Current installed provenance:

- `.harness/lock.yaml`

The depth gate is not part of the portable harness by default. It is a
repo-local strategy layer for building this product.

## Roadmap

### Phase 1: Bootstrap And Dogfood Foundation

Status: substantially complete.

Purpose:

- Establish formal v1 vocabulary and process-domain shape.
- Install the first dogfood modules in this repo.
- Create minimal CLI commands, manifest, doctor, tests, and upgrade planning.
- Prove the depth-gated incremental build loop.

Exit signal:

- `build/depth-gate.yaml` shows the initial tooling/domain pass and
  upgrade-plan lifecycle pass are complete enough for next breadth.

### Phase 2: Module And Profile Installation

Status: substantially complete for v1 install/list lifecycle. Profile
switching and profile inspection are useful follow-ons, but they are no longer
blockers for moving to Phase 3.

Purpose:

- Make process-domain breadth installable without hand-editing manifests.
- Introduce profile/module commands that can add capabilities to a target repo.
- Keep module metadata small but sufficient for install, doctor, and upgrade
  planning.

Initial commands:

- `harness modules list`
- `harness modules add <module>`
- `harness profiles list`
- `harness init --profile <profile>`

Candidate follow-on commands:

- `harness profiles switch <profile>`
- `harness profiles inspect <profile>`

Exit signal:

- A new process-domain module can be installed into a target repo by command.
- Doctor validates the installed module.
- Upgrade plan accounts for the module.
- Tests cover clean install, conflict behavior, and missing artifact behavior.

This phase is the bridge from handcrafted dogfood state to a portable harness
that can carry process-domain improvements into target repos.

### Phase 3: Lock And Provenance

Status: active; closeout lock/provenance contract increment implemented and
dogfooded.

Purpose:

- Make upgrade planning safer by recording what the harness installed and what
  changed locally.
- Distinguish harness-managed, human-modified, generated, and observed files.

Candidate artifacts:

- `.harness/lock.yaml`
- file fingerprints
- template source records
- module/profile version records

Initial behavior:

- `harness init` writes installed-file fingerprints to `.harness/lock.yaml`.
- `harness modules add <module>` updates the lock for module artifacts and the
  manifest.
- `harness lock refresh` rebuilds installed-file provenance from current
  manifest state.
- `harness lock check` reports lock drift without writing.
- `harness doctor` validates lock shape, locked files, and fingerprint drift.
- `harness upgrade --plan` reports lock status and classifies managed files as
  clean, modified, unlocked, or missing.
- `harness upgrade --plan` emits typed operation records such as safe, review,
  blocked, and deferred operations.
- `harness upgrade --plan --json` emits a stable machine-readable plan with
  `plan_schema_version` and `operation_contract_version`.
- `harness upgrade apply` is scaffolded for safe/noop and safe/refresh-lock
  operations plus deterministic package-script command repair.
- `.harness/lock.yaml` records semantic file provenance such as artifact role,
  owner type, module id, merge strategy, source kind, source path, and source
  fingerprint.

Exit signal:

- Upgrade plan can distinguish clean files from locally changed files.
- Upgrade plan reports safe, blocked, and review-required file operations.
- Upgrade behavior is governed by a formal operation contract before Phase 4
  breadth begins.

### Phase 4: Additional Process Domains

Status: active; Structured Metadata, Canonical State, Invariants And Golden
Principles, and Plans And Status breadth increments are implemented and
dogfooded.

Purpose:

- Add v1 process-domain breadth only when the module/profile lifecycle can
  install and validate it.

Remaining likely candidates:

- None currently identified for Phase 4; the next likely roadmap move is Phase
  5 Distribution Readiness unless Plans And Status needs another depth pass.

Initial implemented modules:

- `structured-metadata`
- `canonical-state`
- `invariants-golden-principles`
- `plans-and-status`

Initial behavior:

- `metadata/artifacts.yaml` records durable artifact metadata.
- `harness metadata list` lists artifact IDs, statuses, kinds, and paths, with
  tag/kind/status filters and JSON output.
- `harness metadata check` validates metadata shape.
- `harness metadata report` summarizes metadata by status, kind, and tag.
- `harness doctor` validates metadata when the module is installed.
- `state/canonical-state.yaml` records source, projection, registry,
  lifecycle, generated, scratch, and archive roles for durable state.
- `harness state list` lists canonical state entries with role, status, and
  owner-domain filters plus JSON output.
- `harness state check` validates canonical state shape, active paths,
  dependency references, and metadata references.
- `harness state report` summarizes canonical state by role, status, owner
  domain, and refresh mode.
- `harness doctor` validates canonical state when the module is installed.
- `invariants/golden-principles.yaml` records checked repo rules and canonical
  patterns.
- `harness invariants check` validates the invariant registry and runs active
  `file_exists` and `file_contains` checks.
- `harness doctor` validates invariants when the module is installed.
- `plans/current.yaml` records active, planned, blocked, complete, deferred,
  and archived work while `status.md` remains the human-readable current-state
  projection.
- `harness plans list`, `harness plans check`, and `harness plans report`
  expose and validate structured plan/status state.
- `harness doctor` validates plans/status state when the module is installed.
- The dogfood profile installs the Structured Metadata, Canonical State,
  Invariants And Golden Principles, and Plans And Status modules.

Exit signal:

- At least one additional process domain is installed by the module/profile
  mechanism and dogfooded in this repo.

The personal-scope repo should remain deferred until this phase or later unless
dogfooding requires an external target sooner.

### Phase 5: Distribution Readiness

Status: complete for v1; local packed-package smoke validation, explicit
package boundary validation, release preflight planning, registry version
discovery, external-target smoke, guarded npm publish planning, forced
external-smoke init, and named real-repo smoke against `~/code/meetingly` are
implemented and dogfooded. Public npm registry publication is deferred.

Purpose:

- Prepare the harness for use outside the local checkout.

Candidate work:

- choose npm, Bun, Homebrew, standalone binary, or a staged combination
- publish workflow and registry access policy
- release packaging
- install docs
- smoke tests against external target repos

Initial behavior:

- `harness distribution check` runs `npm pack --dry-run --json` and verifies
  that the npm package includes required runtime files and excludes repo-local
  dogfood/build artifacts.
- `harness distribution release --plan` runs package contents validation and
  `npm publish --dry-run --json`, reports release blockers separately from
  command success, and keeps registry publication blocked while the package is
  private.
- `harness distribution publish --plan` reports the guarded npm publish path,
  and `harness distribution publish --confirm` refuses to publish unless release
  readiness has no blockers.
- `harness distribution smoke` runs `npm pack` against the source repo,
  validates package contents, installs the packed tarball into temporary target
  repos, runs the installed `harness` binary, initializes profiles, runs
  `harness doctor`, and verifies `harness upgrade --plan --json`.
- `harness distribution smoke --target <path>` copies a caller-supplied git
  target into the smoke workspace, installs the packed tarball there, validates
  init/doctor/upgrade behavior, and leaves the original target unchanged.
- `harness distribution smoke --target <path> --force` passes forced init only
  inside the disposable copied target so real repo shapes with existing
  bootstrap files can be validated without mutating the source target.
- Packed-package smoke validation covers the `minimal` and `dogfood` profiles
  by default.
- Upgrade planning reports `version_source.type: package` when a target was
  initialized from the installed package and `local-checkout` for this dogfood
  repo.
- For package-installed targets, upgrade planning queries the npm registry for
  the configured dist tag, records available/unpublished/private/unavailable
  registry status, and falls back to the executing package version when no
  registry version is available.
- The package manifest has an explicit runtime-oriented `files` list plus
  repository, license, keyword, and engine metadata.
- The first npm registry access policy is public; publication remains blocked
  while `private: true`, `UNLICENSED`, or any release preflight blocker remains.
- `docs/install.md` documents local tarball installation and records registry
  publication as deferred.
- `~/code/meetingly` has passed named real-repo smoke for the `minimal` and
  `dogfood` profiles using the packed package and forced init in the temporary
  copy.

Exit signal:

- Satisfied for v1: a named target repo can install and validate the harness
  from the packed package without depending on `~/code/harness`.

## Sequencing Rules

Use this document as a directional map, not a sprint plan.

When choosing the next increment:

1. Prefer the next roadmap phase unless dogfooding exposes a blocking weakness.
2. Add narrow breadth only when the current depth gate allows it.
3. Work depth to the maximum prudent extent before adding more breadth.
4. Prefer increments that improve installation, validation, upgrade planning,
   or dogfood clarity.
5. Do not add a process domain only as prose; it should force concrete tooling
   or dogfood behavior.

## Relationship To Other Documents

- `AGENTS.md` defines how agents operate in this repo.
- `status.md` projects current state.
- `build/depth-gate.yaml` records whether the current atomic increment is deep
  enough to move on.
- `design/v1-process-domain-design.md` defines the v1 domain model.
- `design/v1-installed-manifest-design.md` defines installed state and
  lifecycle behavior.
- `design/v1-incremental-build-strategy.md` defines the repo-local build
  strategy.
- `design/v1-lock-provenance-design.md` defines Phase 3 installed-file
  provenance behavior.
- `design/v1-upgrade-operation-contract.md` defines Phase 3 upgrade-plan and
  apply safety behavior.
- `design/v1-distribution-readiness-design.md` defines Phase 5 package
  boundary, package smoke, and distribution-readiness behavior.
- `spec/` contains exploratory source material and does not override formal
  product or design documents.
