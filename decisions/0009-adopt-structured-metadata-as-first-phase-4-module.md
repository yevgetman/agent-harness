---
id: 9
title: "Adopt structured metadata as first phase 4 module"
status: accepted
date: 2026-05-14
supersedes: []
superseded_by: null
---

# Adopt structured metadata as first phase 4 module

## Context

Phase 3 closed with a stronger lifecycle substrate: installed lock provenance,
JSON upgrade plans, and explicit operation safety. The v1 roadmap says Phase 4
should add additional process-domain breadth only when the module/profile
lifecycle can install and validate it.

Structured Metadata is the best first Phase 4 module because it is narrow,
mechanically validatable, and useful to later domains such as Reports And
Retrieval, Gardening And Entropy Management, and Reconciliation And Drift
Detection.

## Decision

Adopt `structured-metadata` as the first Phase 4 process-domain module.

The module installs `metadata/artifacts.yaml`, exposes `harness metadata list`
and `harness metadata check`, and makes `harness doctor` validate the metadata
registry when the module is installed.

## Consequences

- Phase 4 starts with concrete installable breadth rather than prose-only
  design.
- The dogfood repo now carries a structured artifact inventory alongside
  `index.yaml`.
- The module/profile lifecycle is exercised by another independent domain.
- Metadata remains manually curated for now; scanners, tag queries, dependency
  validation, JSON output, and generated reports are deferred depth work.
