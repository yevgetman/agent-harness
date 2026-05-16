---
id: 20
title: "Adopt guarded npm publish workflow"
status: accepted
date: 2026-05-16
supersedes: []
superseded_by: null
---

# Adopt guarded npm publish workflow

## Context

Phase 5 Distribution Readiness can validate package contents, run release
preflight, discover registry versions, and smoke the packed tarball against
temporary and copied external target repos. The remaining distribution gap is a
publish workflow that future release work can use without turning the current
private package into an accidental publication risk.

The package name is currently unscoped (`portable-harness`). For npm, the first
registry access policy for an unscoped package is public. The package is still
blocked by `private: true` and `UNLICENSED`, so the workflow must expose the
path while refusing publication until a later release decision clears those
blockers.

## Decision

Add a guarded npm publish workflow under `harness distribution publish`.

The workflow supports:

- `harness distribution publish --plan`: run release readiness checks and show
  whether a publish would be allowed.
- `harness distribution publish --confirm`: run the same readiness checks and
  publish only if no blockers remain.

The registry access policy is npm `public`. For scoped package names, the
publish command will pass `--access public`; for the current unscoped package,
npm public access is the default. Publish confirmation remains blocked while
`package.json` has `private: true`, while the license is `UNLICENSED`, or while
release preflight reports any other blocker.

## Consequences

- The repo now has an executable publish workflow path without publishing the
  package.
- The publish plan is dogfooded through `npm run distribution:publish-plan`.
- Future release work can focus on removing explicit blockers rather than
  inventing the publish command shape.
- The package remains unpublished until a separate release decision changes
  `private`, chooses an acceptable license, and confirms registry readiness.
