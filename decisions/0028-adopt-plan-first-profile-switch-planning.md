---
id: 28
title: "Adopt plan-first profile switch planning"
status: accepted
date: 2026-05-22
supersedes: []
superseded_by: null
---

# Adopt plan-first profile switch planning

## Context

V1.1 requires initialized repos to move from one harness profile to another
without manual manifest edits. The repo already has profile inspection,
module-add preflight, profile-bounded safe module install through upgrade
apply, and installed-instance upgrade guidance.

Jumping directly to profile switch apply would combine module installation,
manifest mutation, lock refresh, collision handling, and profile policy in one
step. That would make the safety boundary harder to review and dogfood.

## Decision

Add `harness profiles switch <profile> --plan [--target <path>] [--json]` as
the first profile-switching increment.

The command is read-only. It reuses profile inspection and module-add
preflight, classifies clean missing requested-profile modules as safe planned
installs, classifies collisions as review-required, classifies unavailable
required modules as blocked, and plans the manifest profile update only after
required modules are installed or cleanly installable.

When switching to a smaller profile, modules outside the requested profile are
retained by default rather than removed.

## Consequences

- Profile switching now has a stable planning surface before mutation.
- The plan can be tested in temp targets and copied real repos without writing
  files.
- Apply remains a separate increment and should consume the plan shape rather
  than re-derive unrelated behavior.
- Profile removal remains out of scope; retained modules are explicit deferred
  operations.
