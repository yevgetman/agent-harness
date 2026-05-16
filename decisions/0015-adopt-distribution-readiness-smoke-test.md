---
id: 15
title: "Adopt distribution readiness smoke test"
status: accepted
date: 2026-05-16
supersedes: []
superseded_by: null
---

# Adopt distribution readiness smoke test

## Context

Phase 4 now has four additional process-domain modules installed and dogfooded:
Structured Metadata, Canonical State, Invariants And Golden Principles, and
Plans And Status. The roadmap's next phase is Distribution Readiness.

The largest remaining v1 risk is whether the harness works when it is not run
from `~/code/harness`. Existing tests use source-checkout commands and temp
targets, but they do not prove that the npm package boundary contains the CLI,
modules, profiles, templates, validators, and runtime dependencies needed by a
fresh target repo.

## Decision

Adopt `harness distribution smoke` as the first Phase 5 increment.

The command builds a local npm package tarball with `npm pack`, installs that
tarball into temporary git target repos, runs the installed
`node_modules/.bin/harness` binary, initializes target profiles, runs
`harness doctor`, runs `harness upgrade --plan --json`, and requires upgrade
planning to report `version_source.type: package`.

## Consequences

- Distribution readiness now has an executable smoke test instead of only a
  roadmap placeholder.
- The upgrade planner now distinguishes package-based targets from the dogfood
  local checkout.
- The smoke command is still local and unpublished; release packaging, external
  registry discovery, and non-npm distribution remain follow-up work.
