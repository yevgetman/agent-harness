---
id: 42
title: "Adopt configurable gardening thresholds and reviewed cleanup policy"
status: accepted
date: 2026-06-04
supersedes: []
superseded_by: null
---

# Adopt configurable gardening thresholds and reviewed cleanup policy

## Context

The first `harness garden plan` dogfood run surfaced two useful signals:
an open capture item that needed promotion into the current plan, and completed
plan volume that crossed the initial hard-coded cleanup threshold.

The finding was directionally useful, but hard-coded thresholds are too blunt
for a portable harness. Different repos will tolerate different amounts of
status text, completed plans, capture backlog, and snapshot history. At the
same time, cleanup behavior is sensitive: archiving plans, trimming status, or
rewriting summaries can damage orientation if done automatically.

## Decision

Add configurable Gardening thresholds to `gardening/rules.yaml` and keep
`harness garden plan` read-only.

Thresholds define when garden findings become recommendations or warnings for
open capture items, completed plans, deferred plans, status lines, session
summary lines, and snapshot lines. The dogfood thresholds are tuned so routine
completed-plan growth remains clean until it reaches a higher archive-review
level.

Add an explicit Gardening action policy. The default policy is `read-only`.
Findings may recommend reviewed actions such as plan archive review, status
trim review, memory summary trim review, snapshot trim review, or lock refresh
review, but the command does not apply those actions. Deleting files,
rewriting human-authored content, or archiving managed artifacts remains
prohibited without an explicit future confirmation workflow.

## Consequences

- Installed repos can tune Gardening without changing CLI code.
- Garden findings now carry action labels, making recommendations easier to
  turn into reviewed lifecycle work.
- The harness keeps the review boundary intact: Gardening plans identify
  cleanup pressure but do not mutate target repos.
- Future cleanup apply behavior needs a separate decision, tests, and
  confirm-gated operation contract.
