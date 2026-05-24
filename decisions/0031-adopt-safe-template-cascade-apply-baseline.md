---
id: 31
title: "Adopt safe template cascade apply baseline"
status: accepted
date: 2026-05-24
supersedes: []
superseded_by: null
---

# Adopt safe template cascade apply baseline

## Context

V1.1 is meant to let improvements from the harness source cascade into
installed repos through repo-local plan/apply commands. The existing apply
surface could already install clean missing active-profile modules, repair
some package scripts, refresh lock provenance, and apply noops, but it still
reported general file/template upgrades as deferred.

The lock now has enough source provenance to identify a safe first cascade
case: a module template changed in the current harness source, and the target
file still exactly matches its installed lock fingerprint. In that case the
target has not locally edited the file, so replacing it with the current
source template is deterministic and review-free.

## Decision

Add `safe/update-template-file` as the first cascade apply operation.

The planner emits this operation only when:

- the managed file exists;
- the file matches its installed lock fingerprint;
- the lock entry records `source_kind: module-template`;
- the source template exists in the executing harness source/package; and
- the current source template fingerprint differs from the installed
  `source_sha256`.

`harness upgrade apply` re-checks the target lock fingerprint and source
template fingerprint before writing. If either changed since planning, apply
refuses rather than partially applying. After writing the current template, it
refreshes that file's lock entry with the new installed fingerprint and source
fingerprint.

Locally modified managed files remain `review/modified-managed-file` and are
never overwritten by this operation. Generated files, module definitions,
semantic merges, and conflict-resolution workflows remain outside this first
baseline.

## Consequences

- Installed repos can receive clean module-template improvements through the
  normal `harness upgrade --plan` / `harness upgrade apply` loop.
- The cascade path is narrow enough to be safe: no human-edited file is
  overwritten, and stale plans are rechecked before mutation.
- The upgrade operation contract moves to version 3.
- Broader cascade work remains: module-definition upgrades, manifest command
  synchronization, generated bootstrap files, merge-aware updates, and
  review-mediated conflict handling.
- Profile sync is the next lifecycle increment before adding new process
  domain breadth.
