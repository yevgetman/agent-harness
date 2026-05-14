---
id: 2
title: "Adopt depth gate and plan-first upgrade surface"
status: accepted
date: 2026-05-14
supersedes: []
superseded_by: null
---

# Adopt depth gate and plan-first upgrade surface

## Context

The harness build now has enough integrated surface area that the repo can
accumulate shallow features if new breadth is added without a depth gate.

The current build methodology says to add narrow breadth, work depth to the
maximum prudent extent, and only then add more breadth. Until now that
methodology was enforced through orientation docs and agent discipline, not
mechanical state.

The next narrow breadth item is Harness Lifecycle behavior. The v1 installed
manifest design already says upgrades should be plan-first, but no command
existed to inspect installed state and produce an upgrade plan.

## Decision

Adopt `build/depth-gate.yaml` as a repo-local, non-portable build-strategy
artifact.

`harness doctor` validates the depth gate when it exists, but the depth gate is
not a harness process domain and is not installed into target repos by default.

Add `harness upgrade --plan` as the first narrow Harness Lifecycle surface. The
command is read-only and reports installed version, available local package
version, module version state, managed-file blockers, and known limits. It does
not apply changes.

## Consequences

- The build methodology is now partially mechanical instead of only prose.
- The dogfood repo can represent when a breadth unit is complete enough to move
  on and when the current unit is still in depth work.
- `harness upgrade --plan` creates the right seam for future upgrade behavior
  without implementing unsafe writes.
- Target repos do not inherit the depth-gate methodology unless they choose to
  add their own repo-local strategy layer.
- The upgrade plan remains local-version-only until package/distribution
  version discovery is designed.
