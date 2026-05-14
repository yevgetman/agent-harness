---
title: Harness Context Briefing
generated_on: 2026-05-14
generated_from:
  - design/v1-product-spec-and-roadmap.md
  - design/v1-process-domain-design.md
  - design/v1-installed-manifest-design.md
  - design/v1-incremental-build-strategy.md
  - design/v1-decisions-open-questions-design.md
  - design/v1-module-profile-installation-design.md
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

The product-level baseline is `design/v1-product-spec-and-roadmap.md`.

The process-domain baseline is `design/v1-process-domain-design.md`.

The product spec preserves the broad vision for this codebase: a portable,
agnostic, manifest/module-driven harness that acts partly like a CLI, partly
like an installable scaffold, and partly like an agent operating manual. It
should support docs, code, mixed repos, personal scope, business scope, research
corpora, and other durable agent-operable workspaces.

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

The product spec is directional, not a canonical build plan. The build strategy
is `design/v1-incremental-build-strategy.md`: every process domain integration
should force concrete tooling, and every tooling improvement should serve a
process domain already dogfooded here. The current second layer is breadth,
then depth to the maximum prudent extent, before adding more breadth. This
strategy is local to building this repo, not a portable process domain. The
repo-local gate state is `build/depth-gate.yaml`.

## Dogfood posture

The repo should adopt each process domain incrementally as the harness is
designed and built.

Current dogfood state:

- Agent Operating Contract exists via `AGENTS.md`.
- Plans And Status exists in minimal form via `status.md`.
- Progressive Orientation exists in minimal form via `index.yaml` and this
  context briefing.
- Harness Lifecycle exists in first dogfood form via `.harness/manifest.yaml`
  and module definitions under `modules/`.
- Mechanical Validation exists in first dogfood form via `npm run doctor` and
  `npm test`; doctor now validates command wiring and the depth gate when
  present.
- The first installer surface exists as `harness init --profile minimal`,
  exposed locally as `npm run init`; it now has dry-run, non-git safety, and
  installed metadata.
- The first upgrade surface exists as `npm run upgrade:plan`; it is read-only,
  uses a `local-checkout` version source, and reports no blockers or warnings
  for this dogfood repo.
- The first module/profile installation surface exists via
  `modules/registry.yaml`, `profiles/`, `npm run modules:list`, and
  `node scripts/harness.mjs modules add <module-id> --target <path>`.
- `decisions-open-questions` is mechanically installable from the registry into
  a minimal target, and the broad temp-git test matrix now covers clean install,
  collisions, force install, missing source artifacts, doctor, and upgrade
  planning.
- Decisions And Open Questions exists in first dogfood form via `decisions/`,
  `open-questions.yaml`, `templates/decision.md`, and
  `npm run decisions:new -- "<title>"`, `npm run decisions:list`, and
  `npm run questions:list`.

## Orientation rule

Fresh agents should not crawl the whole repo first.

Read:

1. `AGENTS.md`
2. `status.md`
3. `index.yaml`
4. `state/CONTEXT.md`

Then open the relevant formal design or exploratory spec for the task.

## Near-term work

The next useful step is to choose the next narrow breadth unit after the
module/profile installation depth pass.

- Keep `harness doctor` focused on installed harness health plus active module
  validation unless a formal design expands its scope.
- Expand module definitions only when a command needs the additional metadata.
- Use `build/depth-gate.yaml` to confirm the module/profile installation pass
  before selecting the next breadth unit.
- Use `design/v1-product-spec-and-roadmap.md` as the product-level sequencing
  reference when making that choice.
- Add the next process domain only when it forces one concrete tooling
  improvement and can be dogfooded immediately.
- Keep `status.md` current after significant choices.
