---
id: 30
title: "Use harness source root for template lock checks"
status: accepted
date: 2026-05-23
supersedes: []
superseded_by: null
---

# Use harness source root for template lock checks

## Context

Template-backed module installs record two distinct fingerprints in
`.harness/lock.yaml`: the installed target file hash and the source template
hash. `init` and `modules add` already write the template source hash from the
harness source/package root at install time.

`lock check` rebuilt expected lock metadata from the target repo only. That
made template artifacts report `source_sha256` drift in fresh installed repos
because paths such as
`modules/decisions-open-questions/templates/open-questions.yaml` live in the
executing harness source/package, not in the target repo.

The bug is recorded as open question
`lock-source-sha-drift-on-module-install`. Profile switch apply now exercises
the same template-backed module install path, so the lock checker needs to be
authoritative before deeper cascade apply work depends on it.

## Decision

Resolve template source fingerprints for lock refresh/check against the
executing harness source root first, falling back to the target repo only when
the source path exists there.

This keeps installed file hashes target-local while treating template source
hashes as provenance from the currently executing harness package/source.
Composed lifecycle commands that install modules (`profiles switch --apply`
and `upgrade apply`) also suppress nested module-install stdout so their JSON
outputs remain machine-readable.

## Consequences

- Fresh installed repos can run `harness lock check` after profile init,
  module add, or profile switch apply without false `source_sha256` drift for
  template-backed files.
- `lock check` can be treated as an installed-instance correctness gate for
  current file state and provenance shape before cascade apply work deepens.
- Running a newer harness tool against an older target can surface changed
  template source provenance. Upgrade planning remains the place where those
  source changes should become explicit safe, review, or blocked operations.
- Open question `lock-source-sha-drift-on-module-install` is resolved by this
  behavior.
