---
id: 6
title: "Adopt installed lock provenance"
status: accepted
date: 2026-05-14
supersedes: []
superseded_by: null
---

# Adopt installed lock provenance

## Context

The harness can now install profiles, add modules, validate installed state,
and produce a read-only upgrade plan.

Upgrade planning still needs provenance. The manifest can say a file is managed,
but it cannot tell whether the current file still matches what the harness
installed or whether a human or agent changed it locally.

## Decision

Adopt `.harness/lock.yaml` as the initial installed-file provenance artifact.

The lock records package/profile/module metadata and SHA-256 fingerprints for
installed non-directory artifacts. `harness init` creates it, `harness modules
add` updates it for newly installed module artifacts, `harness doctor`
validates it, and `harness upgrade --plan` uses it to classify managed files as
clean, modified, unlocked, or missing.

## Consequences

- Upgrade planning can now distinguish clean installed files from local edits.
- Missing managed files remain blockers.
- Modified managed files become review-required warnings instead of ambiguous
  marker-only warnings.
- Legacy targets without locks remain diagnosable through warnings.
- The lock must be refreshed when dogfood-managed files intentionally change.
- A standalone `harness lock refresh` command is still future work.
