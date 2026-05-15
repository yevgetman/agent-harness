---
id: 14
title: "Adopt plans and status module"
status: accepted
date: 2026-05-15
supersedes: []
superseded_by: null
---

# Adopt plans and status module

## Context

Structured Metadata, Canonical State, and Invariants And Golden Principles are
installed and dogfooded as Phase 4 process-domain modules. The roadmap lists
Plans And Status as the remaining likely Phase 4 candidate.

The repo already uses `status.md` heavily as the boot-time current-state
projection, but that file is intentionally prose-oriented and should not become
an unbounded task database. The harness needs a structured place to record
active, planned, blocked, complete, deferred, and archived work while preserving
`status.md` as the concise human orientation surface.

## Decision

Adopt `plans-and-status` as the fourth Phase 4 process-domain module.

The module installs `plans/current.yaml`, exposes `harness plans list`,
`harness plans check`, and `harness plans report`, validates the structured
plans/status registry, verifies the referenced status projection, checks plan
references, and makes `harness doctor` validate plans when the module is
installed.

## Consequences

- Current work is now represented in a structured, queryable, and validated
  artifact instead of only in prose.
- `status.md` remains the boot-time current-state projection rather than a task
  database.
- The dogfood repo now has a current plan record that points at Phase 5
  distribution readiness as the next likely larger milestone.
- Automatic synchronization between `status.md` and `plans/current.yaml`, plan
  creation commands, and richer freshness checks remain deferred depth work.
