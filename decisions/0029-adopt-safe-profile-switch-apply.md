---
id: 29
title: "Adopt safe profile switch apply"
status: accepted
date: 2026-05-22
supersedes: []
superseded_by: null
---

# Adopt safe profile switch apply

## Context

Decision 0028 split profile switching into a plan-first increment to keep the
safety boundary inspectable before any mutation. With profile switch planning
now stable - including module-add preflight reuse, review-required and blocked
classification, retained-module accounting, and JSON output - the next narrow
v1.1 increment is the mutation half: actually applying a clean plan.

A profile switch apply touches three lifecycle concerns at once: module
installation, manifest profile mutation, and lock provenance. Combining them
without an explicit safety contract would make refusal semantics, ordering, and
retention behavior hard to reason about and dogfood.

## Decision

Add `harness profiles switch <profile> --apply [--target <path>] [--json]` as
the second profile-switching increment.

Apply behavior:

- Apply rebuilds the switch plan internally and refuses if any operation is
  classified review-required or blocked. Refusal returns the plan unchanged
  and surfaces the offending operation codes in `apply.errors`.
- Apply installs each `safe/profile-module-install` operation by reusing the
  module-add installer. A pre-pass runs `planModuleInstall` for every required
  module before any write, so collisions that appear between plan time and
  apply time refuse cleanly without partial installs.
- After all required modules install, apply mutates `.harness/manifest.yaml`
  by setting `harness.profile` to the requested profile and refreshes the
  lock entry for the manifest. Manifest mutation is the last write, so a
  failed install never leaves the target on the requested profile.
- Modules outside the requested profile are retained by default. Apply records
  `deferred/profile-module-retained` operations in `apply.skipped` and never
  uninstalls retained modules. Profile removal remains out of scope.
- A `safe/profile-noop` plan (target already on the requested profile)
  succeeds as a noop; `safe/profile-module-present` operations are folded
  into a single applied summary line rather than emitting one entry per
  already-installed module.
- `--plan` and `--apply` cannot be combined; either is required for the
  switch subcommand.

`harness profiles switch <profile> --plan` continues to be the read-only
inspection surface and now reports `apply_available: true`.

## Consequences

- Installed instances can move from one profile to a compatible larger or
  smaller profile by running a single command, without manual manifest edits
  or per-module `harness modules add` calls.
- The safety boundary is explicit: any review or blocker in the plan refuses
  the entire apply, and manifest mutation only happens after every required
  install succeeds.
- Retained modules become a first-class deferred operation. Removing extra
  modules from a smaller profile remains explicit follow-up work (see open
  question `profile-module-removal-scope` if and when prioritized).
- The pre-existing lock drift for template-installed managed files
  (`source_sha256` is computed against the source repo at install time but
  recomputed against the target repo at check time) is now exercised by
  apply; the issue is recorded in [[lock-source-sha-drift-on-module-install]]
  and does not affect doctor-level validation.
- Cascade apply for managed file or template upgrades remains out of scope
  for this increment and is the next candidate v1.1 step.
