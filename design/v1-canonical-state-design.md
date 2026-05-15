# Formal Design: V1 Canonical State

**Status:** accepted baseline  
**Date:** 2026-05-15  
**Scope:** second Phase 4 process-domain module for source-of-truth
classification

This is a formal design document. It defines the next Phase 4 process-domain
breadth increment after Structured Metadata.

## Purpose

Canonical State makes the repo's truth model explicit. It distinguishes source
artifacts from projections, registries, lifecycle state, generated outputs,
scratch material, and archives so agents do not have to infer authority only
from prose or directory shape.

The first v1 implementation is intentionally narrow: a checked registry at
`state/canonical-state.yaml`, `harness state` query/check/report commands,
doctor validation when the module is installed, and module/profile
installation.

This domain does not replace Structured Metadata. Structured Metadata says what
durable artifacts exist. Canonical State says what role those artifacts play in
the repo's authority model.

## Artifact

Canonical State installs:

```text
state/canonical-state.yaml
```

Initial shape:

```yaml
canonical_state:
  version: 1
  updated: 2026-05-15
  scope: target-repo
  entries:
    - id: agents
      path: AGENTS.md
      metadata_id: agents
      state_role: source
      status: active
      owner_domain: agent-operating-contract
      refresh: manual
```

Required entry fields:

- `id`
- `path`
- `state_role`
- `status`

Optional entry fields:

- `metadata_id`
- `owner_domain`
- `refresh`
- `depends_on`

Allowed state roles:

- `source` — authoritative source material.
- `projection` — current-state summaries or generated/context projections.
- `registry` — machine-readable indexes, inventories, or lookup tables.
- `lifecycle` — installed harness state, locks, manifests, and upgrade state.
- `generated` — generated outputs that should be refreshed from sources.
- `scratch` — non-authoritative temporary capture.
- `archive` — superseded or retained historical material.

Allowed statuses:

- `active`
- `planned`
- `deprecated`
- `archived`

## Module

The module ID is:

```text
canonical-state
```

It provides:

- canonical state registry
- state list command
- state check command
- state report command
- state filtering
- state-role validation
- metadata reference validation
- doctor validation for installed canonical state

It installs:

- `state/canonical-state.yaml`

## Command

```bash
harness state list
harness state check
harness state report
```

`harness state check` validates `state/canonical-state.yaml` and reports errors
without mutating files.

`harness state list` prints entry IDs, statuses, state roles, and paths. It
supports `--role <role>`, `--status <status>`, and
`--owner-domain <domain>` filters.

`harness state report` summarizes entry counts by state role, status, owner
domain, and refresh mode. It supports the same filters as list.

The commands support:

```bash
harness state list --json
harness state check --json
harness state report --json
harness state check --target <path>
```

## Doctor Behavior

When the `canonical-state` module is installed, `harness doctor` validates:

- `state/canonical-state.yaml` exists.
- YAML parses.
- top-level `canonical_state` exists.
- `canonical_state.version` is `1`.
- `canonical_state.entries` is a list.
- entry IDs are unique.
- required fields are present.
- entry statuses are allowed.
- entry state roles are allowed.
- active entry paths exist.
- `depends_on` is a list when present.
- `depends_on` references point to known canonical-state entry IDs.
- entries do not depend on themselves.
- when `metadata/artifacts.yaml` is available, `metadata_id` references point to
  known artifact IDs.
- when a `metadata_id` resolves, the metadata artifact path matches the
  canonical-state entry path.

## Relationship To Other Domains

Canonical State supports:

- Agent Operating Contract by making authority boundaries explicit.
- Progressive Orientation by clarifying which boot artifacts are sources versus
  projections.
- Structured Metadata by adding authority semantics to registered artifacts.
- Mechanical Validation by making source/projection drift easier to detect.
- Reconciliation And Drift Detection by giving future checks a truth model.
- Gardening And Entropy Management by making scratch, archive, and generated
  material representable.

## Current Limits

- Canonical State is manually curated; no scanner infers state roles yet.
- The first command surface validates references and paths, but it does not yet
  compare projections against their sources.
- The registry does not define freshness windows or regenerate projections.
- Module installation does not merge an existing human-authored
  `state/canonical-state.yaml`.

These limits are acceptable for the first Canonical State breadth unit. The
purpose is to install and dogfood the authority model before deepening it.
