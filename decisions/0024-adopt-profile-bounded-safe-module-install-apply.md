---
id: 24
title: "Adopt profile-bounded safe module install apply"
status: accepted
date: 2026-05-17
supersedes: []
superseded_by: null
---

# Adopt profile-bounded safe module install apply

## Context

V1 closed with a deliberately small `harness upgrade apply` scaffold:
`safe/noop`, `safe/refresh-lock`, and deterministic `safe/repair-command`.
That proved the plan-first apply contract but left lifecycle upgrades unable to
carry newly required profile modules into an installed target.

The unsafe option would be to treat every source-registry module as something
`upgrade apply` may install. Registry availability only means a module can be
installed; it does not mean the target repo has chosen that process domain.
The safer boundary is the target's active profile. If the installed manifest
names a profile and the current source profile includes modules not yet present
in the target manifest, those missing modules are profile-completeness gaps.

## Decision

Extend the upgrade operation contract to version 2 with a profile-bounded
`safe/install-module` operation.

`harness upgrade --plan` may emit `safe/install-module` only when all of these
are true:

- the module is listed in the target's active source profile,
- the module is available and installable from the source registry,
- the module is not already installed in the target manifest, and
- the same collision checks used by `harness modules add` pass without
  `--force`.

Registry modules that are available but not part of the active profile remain
`deferred/installable-module-available`.

Artifact or command collisions for missing profile modules are
`review/install-module-collision`, causing `upgrade apply` to refuse the whole
plan before mutation. Missing source artifacts or other install-unavailable
states are `blocked/install-module-unavailable`.

`harness upgrade apply` reuses the `modules add` install path for
`safe/install-module`; it does not introduce a second installer.

## Consequences

- Upgrade apply can now move a profile-backed target forward when the active
  profile gains a cleanly installable module.
- Optional registry modules remain opt-in through `harness modules add` or
  future profile switching; `upgrade apply` does not install every available
  module.
- Collision and human-authored overwrite risks remain review-required.
- The operation contract version increments from 1 to 2.
- Full file/template upgrades, profile switching, module removal, and conflict
  resolution remain deferred.
