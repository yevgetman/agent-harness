---
id: 10
title: "Deepen structured metadata query and validation"
status: accepted
date: 2026-05-14
supersedes: []
superseded_by: null
---

# Deepen structured metadata query and validation

## Context

Structured Metadata is now installed as the first Phase 4 process-domain
module. The initial module established the artifact registry and basic
validation, but the domain needs enough depth to be useful for agents and
future automation before adding more breadth.

## Decision

Deepen Structured Metadata with:

- `harness metadata list --tag/--kind/--status` filtering.
- `--json` output for metadata list, check, and report.
- `harness metadata report` summary counts by status, kind, and tag.
- validation that `depends_on` references known artifact IDs and does not point
  back to the same artifact.

## Consequences

- The metadata registry can now support retrieval-oriented usage instead of
  only human scanning.
- The registry begins acting like a mechanically checked graph.
- Future reports, stale-artifact scans, and gardening passes can consume stable
  JSON output.
- Metadata generation, cycle detection, richer dependency semantics, and
  automatic artifact discovery remain deferred depth work.
