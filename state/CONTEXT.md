---
title: Harness Context Briefing
generated_on: 2026-05-14
generated_from:
  - design/v1-process-domain-design.md
  - design/v1-installed-manifest-design.md
  - design/v1-incremental-build-strategy.md
  - spec/agnostic-harness-shape.md
  - spec/portability-model.md
---

# Harness Context Briefing

This repo is the source repo and first dogfood target for a portable,
general-purpose agent harness.

The harness should eventually become a CLI-driven infrastructure layer that can
be installed into arbitrary repos - docs, code, mixed workspaces, personal
state, business state, research corpora, or other agent-operable systems.

## Current design baseline

The formal baseline is `design/v1-process-domain-design.md`.

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

The build strategy is `design/v1-incremental-build-strategy.md`: every process
domain integration should force concrete tooling, and every tooling improvement
should serve a process domain already dogfooded here.

## Dogfood posture

The repo should adopt each process domain incrementally as the harness is
designed and built.

Current dogfood state:

- Agent Operating Contract exists via `AGENTS.md`.
- Plans And Status exists in minimal form via `status.md`.
- Progressive Orientation exists in minimal form via `index.yaml` and this
  context briefing.
- Harness Lifecycle exists in first dogfood form via `.harness/manifest.yaml`
  and two module definitions under `modules/`.
- Mechanical Validation exists in first dogfood form via `npm run doctor` and
  `npm test`.
- The first installer surface exists as `harness init --profile minimal`,
  exposed locally as `npm run init`.

## Orientation rule

Fresh agents should not crawl the whole repo first.

Read:

1. `AGENTS.md`
2. `status.md`
3. `index.yaml`
4. `state/CONTEXT.md`

Then open the relevant formal design or exploratory spec for the task.

## Near-term work

The next useful step is to harden the initial runnable infrastructure:

- Decide whether `harness doctor` should become the initial general validation
  surface or stay installation-health-only.
- Expand module definitions only when the next command needs the additional
  metadata.
- Add the next process domain only when it forces one concrete tooling
  improvement.
- Keep `status.md` current after significant choices.
