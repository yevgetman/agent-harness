---
id: 19
title: "Adopt external target distribution smoke"
status: accepted
date: 2026-05-16
supersedes: []
superseded_by: null
---

# Adopt external target distribution smoke

## Context

Phase 5 Distribution Readiness can validate package contents, run a release
preflight, and smoke the packed package in temporary target repositories. That
proves the tarball works outside the source checkout, but the smoke target is
still synthetic.

Before enabling an actual publish workflow, the harness should be able to run
the same packed-package validation against a caller-selected target repo shape.
The command must not mutate the original external repo during validation.

## Decision

Extend `harness distribution smoke` with `--target <path>`.

When one or more targets are provided, the command validates that each target
exists and is a git repo, copies the target into the temporary smoke workspace
without `.git` or `node_modules`, initializes git in the copy, installs the
packed tarball, runs `harness init`, `harness doctor`, and
`harness upgrade --plan --json` in the copy, and leaves the original target
unchanged.

If `--target` is supplied without `--profile`, the smoke defaults to the
`minimal` profile. Repeated `--target` and `--profile` options are allowed; each
target/profile pair runs in its own copied workspace.

## Consequences

- Distribution smoke can now validate realistic target repo contents without
  requiring publication to a registry.
- The original target repo is protected from package install, lockfile, and
  harness init writes.
- Existing default smoke behavior remains unchanged for synthetic `minimal` and
  `dogfood` targets.
- External target smoke still installs a local packed tarball; it does not prove
  registry install, package access policy, or publish automation.
