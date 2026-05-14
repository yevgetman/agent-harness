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

- `harness init --profile minimal`
- `harness doctor`
- `harness decisions new`
- `harness decisions list`
- `harness questions list`
- `harness upgrade --plan`

Current dogfood modules:

- `agent-operating-contract`
- `progressive-orientation`
- `decisions-open-questions`

Current repo-local build support:

- `build/depth-gate.yaml`

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

Status: next likely breadth.

Purpose:

- Make process-domain breadth installable without hand-editing manifests.
- Introduce profile/module commands that can add capabilities to a target repo.
- Keep module metadata small but sufficient for install, doctor, and upgrade
  planning.

Candidate commands:

- `harness modules list`
- `harness modules add <module>`
- `harness profiles list`
- `harness init --profile <profile>`

Exit signal:

- A new process-domain module can be installed into a target repo by command.
- Doctor validates the installed module.
- Upgrade plan accounts for the module.
- Tests cover clean install, conflict behavior, and missing artifact behavior.

This phase is the bridge from handcrafted dogfood state to a portable harness
that can carry process-domain improvements into target repos.

### Phase 3: Lock And Provenance

Status: planned.

Purpose:

- Make upgrade planning safer by recording what the harness installed and what
  changed locally.
- Distinguish harness-managed, human-modified, generated, and observed files.

Candidate artifacts:

- `.harness/lock.yaml`
- file fingerprints
- template source records
- module/profile version records

Exit signal:

- Upgrade plan can distinguish clean files from locally changed files.
- Upgrade plan reports safe, blocked, and review-required file operations.

### Phase 4: Additional Process Domains

Status: planned.

Purpose:

- Add v1 process-domain breadth only when the module/profile lifecycle can
  install and validate it.

Likely candidates:

- Structured Metadata
- Canonical State
- Plans And Status
- Invariants And Golden Principles

Exit signal:

- At least one additional process domain is installed by the module/profile
  mechanism and dogfooded in this repo.

The personal-scope repo should remain deferred until this phase or later unless
dogfooding requires an external target sooner.

### Phase 5: Distribution Readiness

Status: deferred.

Purpose:

- Prepare the harness for use outside the local checkout.

Candidate work:

- choose npm, Bun, Homebrew, standalone binary, or a staged combination
- version-source discovery outside local checkout
- release packaging
- install docs
- smoke tests against external target repos

Exit signal:

- A target repo can install and validate the harness without depending on
  `~/code/harness`.

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
- `spec/` contains exploratory source material and does not override formal
  product or design documents.
