# Formal Design: V1 Invariants And Golden Principles

**Status:** accepted baseline
**Date:** 2026-05-15
**Scope:** third Phase 4 process-domain module for checked repo rules and
canonical patterns

This is a formal design document. It defines the next Phase 4 process-domain
breadth increment after Canonical State.

## Purpose

Invariants And Golden Principles makes important repo rules explicit and
mechanically checkable where the first practical checks are simple enough.

The first v1 implementation is intentionally narrow: a checked registry at
`invariants/golden-principles.yaml`, a `harness invariants check` command,
doctor validation when the module is installed, and module/profile
installation.

The domain complements Canonical State. Canonical State describes which
artifacts are sources, projections, registries, and lifecycle state. Invariants
And Golden Principles describes rules those artifacts must continue to satisfy.

## Artifact

Invariants And Golden Principles installs:

```text
invariants/golden-principles.yaml
```

Initial shape:

```yaml
invariants:
  version: 1
  updated: 2026-05-15
  scope: target-repo
  principles:
    - id: status-is-current-state
      title: Status is a current-state projection
      status: active
      severity: error
      owner_domain: agent-operating-contract
      statement: status.md is current state, not a changelog.
      canonical_state_id: status
      checks:
        - type: file_contains
          path: status.md
          text: not a changelog
```

Required principle fields:

- `id`
- `title`
- `status`
- `statement`

Optional principle fields:

- `severity`
- `owner_domain`
- `canonical_state_id`
- `tags`
- `checks`

Allowed statuses:

- `active`
- `planned`
- `deprecated`
- `archived`

Allowed severities:

- `error`
- `warning`

Supported checks:

- `file_exists` with required `path`.
- `file_contains` with required `path` and `text`.

## Module

The module ID is:

```text
invariants-golden-principles
```

It provides:

- invariant registry
- invariants check command
- simple file existence and file content checks
- canonical-state reference validation when Canonical State is available
- doctor validation for installed invariants

It installs:

- `invariants/`
- `invariants/golden-principles.yaml`

## Command

```bash
harness invariants check
```

`harness invariants check` validates `invariants/golden-principles.yaml` and
runs supported active principle checks without mutating files.

It supports:

```bash
harness invariants check --json
harness invariants check --target <path>
```

## Doctor Behavior

When the `invariants-golden-principles` module is installed,
`harness doctor` validates:

- `invariants/golden-principles.yaml` exists.
- YAML parses.
- top-level `invariants` exists.
- `invariants.version` is `1`.
- `invariants.principles` is a list.
- principle IDs are unique.
- required fields are present.
- principle statuses are allowed.
- principle severities are allowed when present.
- `tags` and `checks` are lists when present.
- active principle checks use supported check types.
- `file_exists` paths exist.
- `file_contains` paths exist and contain required text.
- when `state/canonical-state.yaml` is available, `canonical_state_id`
  references point to known canonical-state entry IDs.

## Relationship To Other Domains

Invariants And Golden Principles supports:

- Agent Operating Contract by making repo rules explicit.
- Canonical State by referencing source/projection/registry artifacts that own
  rules.
- Mechanical Validation by turning selected rules into deterministic checks.
- Reconciliation And Drift Detection by giving future checks explicit rule
  records.
- Gardening And Entropy Management by making stale or deprecated principles
  representable.

## Current Limits

- The first check language only supports file existence and substring checks.
- Principles are manually curated; there is no discovery or extraction from
  prose yet.
- The registry does not yet support cross-file semantic assertions.
- Module installation does not merge an existing human-authored invariants
  file.

These limits are acceptable for the first breadth unit. The purpose is to make
a small set of repo rules portable, inspectable, and mechanically checked
before deepening enforcement.
