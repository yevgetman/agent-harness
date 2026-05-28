---
id: 37
title: "Adopt capture and triage baseline module"
status: accepted
date: 2026-05-28
supersedes: []
superseded_by: null
---

# Adopt capture and triage baseline module

## Context

Durable Memory now preserves stable cross-session context, but the harness
still lacks a structured place for unpromoted observations, possible tasks,
bugs, questions, and follow-up ideas.

Without a capture layer, agents either lose useful material in chat history or
promote it too early into authoritative artifacts such as plans, decisions,
canonical state, or memory.

## Decision

Add `capture-triage` as an installable harness module and include it in the
`full` profile.

The first baseline provides:

- `capture/inbox.yaml` for captured, not-yet-authoritative items.
- `capture/triage.yaml` for triage records and promotion targets.
- `capture/README.md` for local discipline.
- `harness capture list`, `harness capture add`, `harness capture triage`,
  `harness capture check`, and `harness capture report` for executable
  behavior and validation.

The first baseline records promotion targets. It does not automatically edit
plans, decisions, open questions, canonical state, status, or memory.

## Consequences

- The `full` profile now installs nine modules.
- Agents have a safe intake layer for rough material before promotion.
- Capture And Triage remains subordinate to authoritative process domains.
- Future increments can add promotion automation once the routing rules are
  dogfooded and reviewed.
