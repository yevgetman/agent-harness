---
id: 38
title: "Adopt Application Corpus Legibility baseline module"
status: accepted
date: 2026-05-28
supersedes: []
superseded_by: null
---

# Adopt Application Corpus Legibility baseline module

## Context

V1.1 has completed Durable Memory and Capture And Triage as process-domain
breadth increments. The next roadmap gap is Application / Corpus Legibility:
agents need a repo-local way to understand how to inspect the target repo's
actual subject matter, not only how to follow the harness workflow.

The harness must work across application repos, document repos, mixed repos,
and personal/project corpora, so the first baseline cannot assume a specific
framework, test runner, runtime, or corpus shape.

## Decision

Adopt `application-corpus-legibility` as the next baseline module in the `full`
profile.

The module will install `legibility/README.md`, `legibility/inventory.yaml`,
and `legibility/notes.md`. It will add `harness legibility list`,
`harness legibility check`, and `harness legibility report` so target repos can
record and validate inspection surfaces such as app commands, checks, logs,
fixtures, runtime notes, source maps, corpus indexes, smoke targets, and
generated reports.

## Consequences

- Application / Corpus Legibility becomes executable and dogfooded instead of
  remaining roadmap prose.
- The baseline is inventory-first, which keeps it portable across repo types
  but requires agents to populate useful target-specific entries.
- Mechanical Validation remains responsible for pass/fail checks; this module
  records how to inspect the repo.
- Reports And Retrieval can later compose this inventory into broader
  cross-domain summaries.
