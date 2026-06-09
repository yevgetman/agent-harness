---
id: 45
title: "Adopt safe profile sync apply"
status: accepted
date: 2026-06-09
supersedes: []
superseded_by: null
---

# Adopt safe profile sync apply

## Context

Profile sync planning can already read a target repo's active manifest profile,
classify missing active-profile modules, and distinguish clean installs from
review-required collisions and blockers.

After lifecycle backups and rollback planning, clean sync apply is the next
small private-production hardening step. It removes manual `modules add`
work when a target manifest already declares a profile whose module bundle is
not fully installed.

## Decision

Add `harness profiles sync --apply`.

The command rebuilds the sync plan internally, refuses any review-required or
blocked operation, pre-checks every required module install before writing,
creates one lifecycle backup for the mutation set, installs clean missing
active-profile modules through the existing module installer, refreshes lock
provenance through that installer, and retains modules outside the active
profile by default.

Sync apply does not switch profiles, remove modules, resolve artifact
collisions, merge human-authored files, or apply rollback restore behavior.

## Consequences

- Installed repos can reconcile a clean active-profile/module mismatch with a
  single plan-first command.
- The implementation reuses module-add preflight and installation behavior
  instead of adding a second module installer.
- Refusal remains conservative for review-required or blocked plans.
- Future work can focus on review-mediated upgrade workflows, profile removal,
  and rollback restore/apply after more evidence.
