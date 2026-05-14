---
id: 1
title: Adopt Decisions And Open Questions domain
status: accepted
date: 2026-05-14
supersedes: []
superseded_by: null
---

# Adopt Decisions And Open Questions domain

## Context

The harness has a formal v1 process-domain design, an installed manifest design,
and a short-term incremental build strategy. It is now making durable design and
tooling choices: module boundaries, CLI behavior, validation scope, and upgrade
semantics.

Before the design surface grows further, future agents need a durable place to
answer "why did we choose this?" and a structured place to hold unresolved
questions that should not live indefinitely in `status.md`.

The incremental build strategy also requires every process-domain integration to
force concrete tooling. This domain is a good next increment because it creates
immediate pressure on both the CLI and `doctor`.

## Decision

Adopt the Decisions And Open Questions process domain as the next dogfooded
domain in this repo.

Install:

- `decisions/`
- `open-questions.yaml`
- `templates/decision.md`
- `modules/decisions-open-questions/module.yaml`

Add:

- `harness decisions new "<title>"`
- doctor validation for decision records and open questions

## Consequences

Future durable choices should become decision records when a future maintainer
or agent would reasonably ask why the choice was made.

Open questions that affect design, implementation, compatibility, upgrade
behavior, or future process-domain choices should live in `open-questions.yaml`
instead of accumulating in `status.md`.

The harness now has a broader validation surface. `doctor` no longer validates
only installation health; when the Decisions And Open Questions module is
installed, it also validates decision-record and open-question shape.

The tradeoff is more structure earlier in the repo's life. That is acceptable
because this process domain directly supports ongoing design work and adds
useful tooling pressure immediately.
