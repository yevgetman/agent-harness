---
id: 7
title: "Adopt safe upgrade apply scaffold"
status: accepted
date: 2026-05-14
supersedes: []
superseded_by: null
---

# Adopt safe upgrade apply scaffold

## Context

The harness now records installed-file provenance, checks lock drift, and
produces typed upgrade-plan operations.

The next step toward upgrade application should not jump directly to broad file
mutation. The planner still reports review and blocked operations for local
edits, missing files, missing locks, and invalid state.

## Decision

Adopt a limited `harness upgrade apply` scaffold that only permits safe classes:

- satisfied `safe/noop` operations
- `safe/refresh-lock` operations when no blocked or review-required operations
  are present

The command refuses plans that contain `blocked/*` or `review/*` operations.
Full upgrade application remains deferred.

## Consequences

- The harness now has a concrete apply command without allowing unsafe writes.
- Upgrade plans remain the source of truth for operation safety.
- Lock refresh can become an applyable operation once a plan is already clean.
- Review-required and blocked states still require human or agent judgment.
- Future work can extend apply one operation class at a time.
