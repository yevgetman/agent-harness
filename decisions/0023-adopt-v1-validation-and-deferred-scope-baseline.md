---
id: 23
title: "Adopt V1 validation and deferred scope baseline"
status: accepted
date: 2026-05-16
supersedes: []
superseded_by: null
---

# Adopt V1 validation and deferred scope baseline

## Context

Phase 5 Distribution Readiness is complete for v1 local-tarball distribution.
The harness has executable behavior, validation, tests, docs, and dogfood
evidence across installation, module/profile lifecycle, lock/provenance,
upgrade planning, additional process-domain modules, package boundary,
distribution smoke, and named real-repo smoke against `~/code/meetingly`.

The remaining ambiguity is not executable capability but closeout clarity:
future agents need one durable place that says what v1 proves, how to rerun the
validation, and what is intentionally deferred.

## Decision

Adopt `docs/v1-validation.md` as the v1 validation and deferred-scope baseline.

Use it to distinguish:

- v1-supported behavior,
- validation commands required before claiming the baseline is healthy,
- expected blocked release/publish state, and
- post-v1 work.

## Consequences

- V1 closeout is grounded in a concrete validation matrix instead of transcript
  memory.
- Public npm publication, release license selection, full upgrade apply,
  profile switching/inspection, non-npm distribution, and deeper process-domain
  implementations remain explicit post-v1 work.
- Future changes that claim to preserve or expand v1 should update
  `docs/v1-validation.md` and rerun the closeout command set.
