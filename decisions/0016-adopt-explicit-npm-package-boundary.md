---
id: 16
title: "Adopt explicit npm package boundary"
status: accepted
date: 2026-05-16
supersedes: []
superseded_by: null
---

# Adopt explicit npm package boundary

## Context

The first Phase 5 increment proved that the harness can be packed with
`npm pack`, installed into temporary target repos, and executed through the
installed `harness` binary.

That smoke test exposed a packaging weakness: without an explicit npm package
boundary, npm fell back to gitignore behavior and included dogfood state,
build-state files, decisions, specs, fixtures, and other source-repo artifacts
that are not required at runtime.

## Decision

Adopt an explicit npm package boundary for the current tarball distribution
path.

The package includes CLI scripts, module definitions, module templates,
profiles, install docs, and the Distribution Readiness design. It excludes
repo-local dogfood state such as `.harness/`, `build/`, `decisions/`,
`metadata/`, `plans/`, `state/`, `status.md`, specs, and test fixtures.

Add `harness distribution check` / `npm run distribution:check` as a dry-run
package contents validator, and make `harness distribution smoke` run the same
package boundary validation before installing the tarball into temporary target
repos.

Keep the package private and unpublished until a later release decision chooses
the package name, registry access policy, and publish workflow.

## Consequences

- The tarball is now intentionally small and runtime-oriented instead of a
  source-repo snapshot.
- Package contents drift is mechanically checked before smoke validation.
- Local tarball installation is documented.
- Published registry installation, external version discovery, and release
  automation remain follow-up work.
