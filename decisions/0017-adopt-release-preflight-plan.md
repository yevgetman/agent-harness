---
id: 17
title: "Adopt release preflight plan"
status: accepted
date: 2026-05-16
supersedes: []
superseded_by: null
---

# Adopt release preflight plan

## Context

Phase 5 now has a local tarball install path, package contents validation, and
packed-package smoke validation. The next Distribution Readiness risk is
release behavior: the package should not be published accidentally, but future
publish attempts should have an executable preflight instead of relying on a
manual checklist.

Running npm's dry-run publish surfaced that npm can auto-correct package
metadata before publish. That class of issue should be caught before any real
release attempt.

## Decision

Adopt `harness distribution release --plan` and
`npm run distribution:release-plan` as the release preflight surface.

The command runs package contents validation and `npm publish --dry-run --json`.
It reports whether the preflight command executed successfully separately from
whether the package is ready to publish. While `package.json` has
`private: true`, the plan remains blocked by design.

Npm dry-run publish auto-correction is a blocker because it means the checked-in
package metadata differs from what npm would publish.

## Consequences

- Release readiness now has an executable plan before any publish command
  exists.
- Publishing remains intentionally blocked until package access policy and
  release workflow are decided.
- The package `bin` metadata is normalized so npm no longer auto-corrects it in
  dry-run publish.
- Registry version discovery, actual publish automation, and external-target
  smoke remain follow-up work.
