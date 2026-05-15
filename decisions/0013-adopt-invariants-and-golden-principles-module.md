---
id: 13
title: "Adopt invariants and golden principles module"
status: accepted
date: 2026-05-15
supersedes: []
superseded_by: null
---

# Adopt invariants and golden principles module

## Context

Structured Metadata and Canonical State are installed and deep enough to make
durable artifacts and authority roles queryable. The next Phase 4 breadth unit
should build on that foundation and force concrete validation instead of adding
more prose-only process guidance.

The v1 roadmap lists Invariants And Golden Principles as a likely Phase 4
candidate. This repo already has rules future agents must preserve, including
formal design authority, status discipline, repo-local depth-gate boundaries,
and lock refresh discipline.

## Decision

Adopt `invariants-golden-principles` as the next Phase 4 process-domain
module.

The module installs `invariants/golden-principles.yaml`, exposes
`harness invariants check`, validates invariant registry shape, runs active
`file_exists` and `file_contains` checks, and makes `harness doctor` validate
invariants when the module is installed.

## Consequences

- Selected repo rules are now durable, structured, and mechanically checked.
- The dogfood repo now has a small invariant registry that references existing
  operating-contract, status, build-strategy, and lock-discipline rules.
- Future reconciliation and doctor work can build on explicit invariant records.
- Rich semantic checks, automatic extraction from prose, and generated
  invariant reports remain deferred depth work.
