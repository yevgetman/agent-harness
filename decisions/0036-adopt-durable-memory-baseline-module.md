---
id: 36
title: "Adopt durable memory baseline module"
status: accepted
date: 2026-05-28
supersedes: []
superseded_by: null
---

# Adopt durable memory baseline module

## Context

V1.1 lifecycle depth is sufficient to resume process-domain breadth. The
roadmap identifies Durable Memory as the next remaining process-domain baseline
because it improves cross-session continuity before adding broader capture,
legibility, reporting, reconciliation, and gardening domains.

The harness already has current-state, canonical-state, decision, and plan
artifacts. Durable Memory should not duplicate those authorities. It should
hold durable operator preferences, repo notes, and concise session summaries
that future agents need but that are not yet formal decisions or canonical
state.

## Decision

Add `durable-memory` as an installable harness module and include it in the
`full` profile.

The first baseline provides:

- `memory/operator-preferences.yaml` for structured operator preferences.
- `memory/repo-notes.md` for durable repo notes.
- `memory/session-summaries.md` for concise cross-session summaries.
- `memory/README.md` for local discipline.
- `harness memory list`, `harness memory check`, and `harness memory report`
  for executable behavior and validation.

The module is dogfooded in this source repo and should be installed into target
repos through the normal profile/module lifecycle.

## Consequences

- The `full` profile now installs eight modules.
- Durable preferences become mechanically checkable and reportable.
- Memory remains subordinate to formal decisions, plans, status, and canonical
  state; important facts should be promoted out of memory when they become
  authoritative.
- Future process-domain increments can rely on memory for continuity while
  keeping current-state and decision records clean.
