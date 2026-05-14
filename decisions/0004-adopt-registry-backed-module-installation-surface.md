---
id: 4
title: "Adopt registry-backed module installation surface"
status: accepted
date: 2026-05-14
supersedes: []
superseded_by: null
---

# Adopt registry-backed module installation surface

## Context

The dogfood repo had module definitions and an installed manifest, but adding a
process-domain module still required hand-editing target files. That does not
match the v1 product goal: process-domain improvements should be portable and
cascade into installed repos through harness tooling.

The next breadth item also needed to stay narrow. A complete package manager,
profile switcher, or upgrade apply engine would be premature before one module
can be listed, installed, validated, and reported by the upgrade planner.

## Decision

Adopt a source registry at `modules/registry.yaml`, profile records under
`profiles/`, and first module commands:

- `harness modules list`
- `harness modules add <module-id>`

`decisions-open-questions` is the first module installable through this surface.
The bootstrap modules remain profile-installed by `harness init --profile
minimal` until they have complete standalone install metadata.

## Consequences

- Future process-domain breadth should define install metadata before it is
  considered mechanically portable.
- Doctor now has registry/profile shape to validate.
- Upgrade planning can show registry modules that are available but not
  installed.
- The first `modules add` implementation is intentionally collision-averse and
  does not merge human-authored files.
- Broad temp-git tests and depth-gate promotion are follow-up work after this
  increment is reviewed.
