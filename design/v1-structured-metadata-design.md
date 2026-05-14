# Formal Design: V1 Structured Metadata

**Status:** accepted baseline  
**Date:** 2026-05-14  
**Scope:** first Phase 4 process-domain module for machine-readable artifact
metadata

This is a formal design document. It defines the first Phase 4 process-domain
breadth increment.

## Purpose

Structured Metadata makes durable repo artifacts machine-legible without
requiring agents to infer every important file from prose or directory shape.

The first v1 implementation is intentionally narrow: a small artifact registry,
two CLI commands, doctor validation, and module/profile installation. It does
not replace `index.yaml`; it complements it.

`index.yaml` remains the progressive orientation graph. `metadata/artifacts.yaml`
is a broader machine-readable inventory that future retrieval, reports,
gardening, and validation can consume.

## Artifact

Structured Metadata installs:

```text
metadata/artifacts.yaml
```

Initial shape:

```yaml
metadata:
  version: 1
  updated: 2026-05-14
  scope: target-repo
  artifacts:
    - id: agents
      path: AGENTS.md
      kind: operating-contract
      status: active
      owner_domain: agent-operating-contract
      tags:
        - agents
        - orientation
```

Required artifact fields:

- `id`
- `path`
- `kind`
- `status`

Optional artifact fields:

- `owner_domain`
- `tags`
- `depends_on`

Allowed statuses:

- `active`
- `planned`
- `deprecated`
- `archived`

## Module

The module ID is:

```text
structured-metadata
```

It provides:

- artifact metadata registry
- metadata list command
- metadata check command
- doctor validation for metadata shape

It installs:

- `metadata/`
- `metadata/artifacts.yaml`

## Commands

```bash
harness metadata list
harness metadata check
```

`harness metadata list` prints artifact IDs, statuses, kinds, and paths.

`harness metadata check` validates `metadata/artifacts.yaml` and reports errors
without mutating files.

## Doctor Behavior

When the `structured-metadata` module is installed, `harness doctor` validates:

- `metadata/artifacts.yaml` exists.
- YAML parses.
- top-level `metadata` exists.
- `metadata.version` is `1`.
- `metadata.artifacts` is a list.
- artifact IDs are unique.
- required fields are present.
- artifact statuses are allowed.
- active artifact paths exist.
- `tags` and `depends_on` are lists when present.

## Relationship To Other Domains

Structured Metadata supports:

- Progressive Orientation by giving agents a lightweight artifact inventory.
- Mechanical Validation by making metadata checkable.
- Reports And Retrieval by giving future commands structured inputs.
- Gardening And Entropy Management by making stale or archived artifact states
  representable.
- Harness Lifecycle by making module-installed metadata visible to upgrade
  planning and lock provenance.

## Current Limits

- Metadata is manually curated; no automatic scanner populates it yet.
- There is no dependency graph validation beyond field shape.
- The metadata registry does not supersede `index.yaml`.
- The first command surface lists and checks metadata only; it does not query by
  tag, emit JSON, or generate reports yet.
- Module installation does not merge existing human-authored metadata files.

These limits are acceptable for the first Phase 4 breadth unit. The purpose is
to install and dogfood the domain before deepening it.
