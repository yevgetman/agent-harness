---
id: 18
title: "Adopt registry version discovery"
status: accepted
date: 2026-05-16
supersedes: []
superseded_by: null
---

# Adopt registry version discovery

## Context

Phase 5 Distribution Readiness has a local packed-package smoke path, an
explicit package boundary, and a release preflight plan. Upgrade planning can
already distinguish local checkout installs from package-installed targets, but
package-installed plans still used only the version of the package currently
executing.

That is enough while the package is private and unpublished, but it does not
exercise the future upgrade path where a target needs to compare its installed
harness version with the latest registry version. The first registry increment
needs to expose this state without making the currently unpublished/private
package fail normal smoke or dogfood checks.

## Decision

Add npm registry version discovery to `harness upgrade --plan` for
package-installed targets.

The planner records the result under `version_source.registry` with one of
these statuses:

- `available`
- `unpublished-or-private`
- `unavailable`
- `skipped`

When the registry returns a version, that version becomes
`available_harness_version` and the existing harness-version-change operation
marks differences as review-required. When the package is unpublished/private,
unavailable, or lookup is skipped, the planner falls back to the executing
package version and does not add warnings or blockers for registry state alone.

## Consequences

- Package-installed upgrade plans now carry registry state that future upgrade
  behavior can build on.
- Local and smoke validation remain deterministic by injecting fixture registry
  results in tests and supporting `HARNESS_REGISTRY_DISCOVERY=skip` for
  subprocess paths.
- The dogfood source checkout remains `local-checkout`; it does not query the
  registry for its own upgrade plan.
- This decision does not publish the package, choose registry access policy, or
  implement a full upgrade apply workflow.
