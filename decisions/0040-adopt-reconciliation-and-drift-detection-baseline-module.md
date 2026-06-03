---
id: 40
title: "Adopt Reconciliation And Drift Detection baseline module"
status: accepted
date: 2026-06-03
supersedes: []
superseded_by: null
---

# Adopt Reconciliation And Drift Detection baseline module

## Context

Reports And Retrieval now provides cross-domain summaries. The next v1.1
roadmap gap is Reconciliation And Drift Detection: installed targets need a
local way to inspect whether their harness state has drifted before choosing
doctor, lock refresh, upgrade apply, manual review, or future repair commands.

The existing lifecycle already detects important lock and upgrade drift. The
missing domain-level surface is a plan-only reconciliation view that composes
selected local checks without mutating target files.

## Decision

Adopt a baseline `reconciliation-drift-detection` module in the `full` profile.

The module owns `reconciliation/README.md`, `reconciliation/rules.yaml`, and
`reconciliation/snapshots.md`; exposes `harness reconcile list`, `check`,
`report`, and `plan`; and lets `harness doctor` validate the reconciliation
rules when the module is installed.

The first reconciliation behavior is plan-only. It reports local drift across
manifest, lock, active profile, module registry, command wiring, metadata,
canonical state, and plans/status validation. It does not repair or mutate
files.

## Consequences

- Installed repos get a local drift plan before mutation or manual repair.
- The domain strengthens the plan-before-mutate model without expanding
  automatic apply behavior.
- Some findings overlap with doctor, lock check, and upgrade planning; that is
  intentional because Reconciliation composes those concerns into a drift view.
- Gardening And Entropy Management becomes the next breadth candidate because
  stale-artifact recommendations are more useful once drift can be inspected.
