---
id: 39
title: "Adopt Reports And Retrieval baseline module"
status: accepted
date: 2026-06-01
supersedes: []
superseded_by: null
---

# Adopt Reports And Retrieval baseline module

## Context

The v1.1 roadmap calls for remaining process-domain breadth after Durable
Memory, Capture And Triage, and Application / Corpus Legibility. The repo now
has enough local harness state that agents need cross-domain summaries without
turning the source repo into a central registry of installed targets.

Reports And Retrieval should make installed repo state easier to inspect while
preserving the installed-instance boundary: every target owns its local report
catalog and generated summaries.

## Decision

Adopt a baseline `reports-retrieval` module in the `full` profile.

The module owns `reports/README.md`, `reports/catalog.yaml`, and
`reports/snapshots.md`; exposes `harness reports list`, `check`, `report`, and
`generate`; and lets `harness doctor` validate the report catalog when the
module is installed.

The first generated report is a lightweight installed-harness overview composed
from local target files. Heavy retrieval, embeddings, chunking, and stale-report
cleanup remain deferred.

## Consequences

- Installed repos get a concrete place for recurring cross-domain report
  definitions and durable snapshots.
- Agents can request a local installed-harness overview without manually
  inspecting every domain registry.
- The source repo still does not track where the harness is installed.
- Reconciliation And Drift Detection becomes the next breadth candidate because
  Reports And Retrieval now provides a summary surface for future drift reports.
