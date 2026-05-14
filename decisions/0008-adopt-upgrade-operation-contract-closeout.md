---
id: 8
title: "Adopt upgrade operation contract closeout"
status: accepted
date: 2026-05-14
supersedes: []
superseded_by: null
---

# Adopt upgrade operation contract closeout

## Context

Phase 3 Lock And Provenance has a working lock file, typed upgrade operations,
operation summaries, and a narrow safe apply scaffold. Before adding more v1
process-domain breadth, the upgrade lifecycle needs a stronger contract so
future modules can rely on stable machine-readable plans and explicit apply
safety rules.

## Decision

Adopt `design/v1-upgrade-operation-contract.md` as the formal v1 contract for
upgrade-plan shape, operation classes, apply-enabled operations, and apply
refusal behavior.

The closeout increment adds:

- stable `plan_schema_version` and `operation_contract_version` fields.
- `harness upgrade --plan --json` for machine-readable upgrade plans.
- richer semantic lock provenance fields.
- `safe/repair-command` for deterministic package-script repair only.

## Consequences

- Future upgrade behavior should add operation codes to the contract before
  implementing mutation.
- Apply remains conservative and must refuse blocked or review-required plans.
- Human-facing document rewrites, template merges, module installation, and
  profile switching remain deferred until separately designed and tested.
- The harness repo gets a stronger lifecycle substrate before Phase 4
  process-domain breadth begins.
