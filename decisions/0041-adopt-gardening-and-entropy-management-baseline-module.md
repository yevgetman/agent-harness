---
id: 41
title: "Adopt Gardening And Entropy Management baseline module"
status: accepted
date: 2026-06-03
supersedes: []
superseded_by: null
---

# Adopt Gardening And Entropy Management baseline module

## Context

The remaining v1.1 process-domain gap after Reconciliation And Drift
Detection is Gardening And Entropy Management. The harness now has enough
durable state that entropy can accumulate: open capture items, completed plan
volume, stale snapshots, long status projections, and lock drift all need a
local inspection surface before any cleanup behavior exists.

The first useful increment should not delete, archive, or rewrite files. It
should make cleanup pressure visible while preserving the existing
plan-before-mutate and review-boundary model.

## Decision

Adopt a baseline `gardening-entropy-management` module in the `full` profile.

The module owns `gardening/README.md`, `gardening/rules.yaml`, and
`gardening/snapshots.md`; exposes `harness garden list`, `check`, `report`,
and `plan`; and lets `harness doctor` validate the gardening rules when the
module is installed.

The first gardening behavior is read-only. It reports local cleanup and
entropy recommendations across capture, plans/status, status projection,
memory, reports, snapshots, and lock health. It does not mutate target files.

## Consequences

- Installed repos get a local cleanup-pressure view before archive, trim, or
  deletion behavior exists.
- The baseline complements Reconciliation: Reconciliation asks whether state
  has drifted; Gardening asks whether durable state is becoming stale, noisy,
  or too large.
- Recommendations may overlap with status, capture, plans, memory, reports, or
  lock commands; that is intentional because Gardening composes cleanup
  signals into one operator-facing plan.
- Future mutation behavior must remain explicit, confirm-gated, and scoped to
  safe or reviewed operations.
