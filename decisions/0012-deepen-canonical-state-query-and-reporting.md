---
id: 12
title: "Deepen canonical state query and reporting"
status: accepted
date: 2026-05-15
supersedes: []
superseded_by: null
---

# Deepen canonical state query and reporting

## Context

Canonical State is installed as the second Phase 4 process-domain module. The
initial increment created `state/canonical-state.yaml` and `harness state
check`, which validates the authority registry but does not make it easy for
agents or future automation to query the truth model.

Structured Metadata already has list, filter, report, and JSON surfaces. The
same shape is useful for Canonical State before adding another Phase 4 breadth
unit.

## Decision

Deepen Canonical State with:

- `harness state list`.
- `harness state list --role/--status/--owner-domain` filtering.
- `harness state report` summary counts by role, status, owner domain, and
  refresh mode.
- `--json` output for state list and report.

## Consequences

- Agents can inspect source, projection, registry, and lifecycle state without
  reading the full YAML file.
- Future reconciliation and gardening commands can consume stable JSON output.
- Canonical State now has enough query depth to support the next breadth
  decision.
- Projection freshness checks, source/projection comparison, automatic state
  discovery, and generated reports remain deferred depth work.
