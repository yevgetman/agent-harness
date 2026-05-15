# Formal Design: V1 Plans And Status

**Status:** accepted baseline
**Date:** 2026-05-15
**Scope:** fourth Phase 4 process-domain module for structured active work and
current status projection references

This is a formal design document. It defines the next Phase 4 process-domain
breadth increment after Invariants And Golden Principles.

## Purpose

Plans And Status tracks work in motion without turning `status.md` into a task
database.

The first v1 implementation is intentionally narrow: a structured registry at
`plans/current.yaml`, `harness plans` list/check/report commands, doctor
validation when the module is installed, and module/profile installation.

`status.md` remains the human-readable current-state projection used during
agent boot. `plans/current.yaml` gives agents and tooling a compact structured
view of active, planned, blocked, complete, deferred, and archived work.

## Artifact

Plans And Status installs:

```text
plans/current.yaml
```

Initial shape:

```yaml
plans_status:
  version: 1
  updated: 2026-05-15
  scope: target-repo
  status_projection: status.md
  plans:
    - id: current-work
      title: Current work
      status: active
      priority: high
      owner_domain: plans-and-status
      summary: Fill in the current work state for this repo.
      next_action: Replace this template plan with the repo's active work.
      canonical_state_id: status
      references:
        - status.md
```

Required top-level fields:

- `version`
- `status_projection`
- `plans`

Required plan fields:

- `id`
- `title`
- `status`
- `summary`

Optional plan fields:

- `priority`
- `owner_domain`
- `next_action`
- `canonical_state_id`
- `tags`
- `references`

Allowed plan statuses:

- `planned`
- `active`
- `blocked`
- `complete`
- `deferred`
- `archived`

Allowed priorities:

- `low`
- `medium`
- `high`
- `urgent`

`next_action` is required for `active` and `blocked` plans.

`references` is a list of repo-relative file paths that should exist while the
plan is active.

## Module

The module ID is:

```text
plans-and-status
```

It provides:

- plans/status registry
- plans list command
- plans check command
- plans report command
- status projection validation
- simple reference-path validation
- canonical-state reference validation when Canonical State is available
- doctor validation for installed plans/status state

It installs:

- `plans/`
- `plans/current.yaml`

## Commands

```bash
harness plans list
harness plans check
harness plans report
```

The commands support:

```bash
harness plans list --status active
harness plans list --owner-domain harness-lifecycle
harness plans list --priority high
harness plans list --json
harness plans check --json
harness plans report --json
```

## Doctor Behavior

When the `plans-and-status` module is installed, `harness doctor` validates:

- `plans/current.yaml` exists.
- YAML parses.
- top-level `plans_status` exists.
- `plans_status.version` is `1`.
- `status_projection` points to an existing file.
- the status projection contains a `Last updated:` line.
- `plans` is a list.
- plan IDs are unique.
- required plan fields are present.
- plan statuses are allowed.
- plan priorities are allowed when present.
- `tags` and `references` are lists when present.
- active and blocked plans have `next_action`.
- referenced files exist.
- when `state/canonical-state.yaml` is available, `canonical_state_id`
  references point to known canonical-state entry IDs.

## Relationship To Other Domains

Plans And Status supports:

- Agent Operating Contract by keeping `status.md` useful during boot.
- Progressive Orientation by pointing agents to active work before deeper
  context.
- Canonical State by referencing the status projection and other state owners.
- Structured Metadata by giving plans durable artifact records.
- Reports And Retrieval by providing a first structured work report surface.
- Mechanical Validation by letting doctor reject stale or malformed plan state.

## Current Limits

- Plans are manually curated.
- The registry does not yet compute freshness from git or issue trackers.
- There is no `harness plans new` creation command yet.
- There is no automatic synchronization between `status.md` prose and
  `plans/current.yaml`.

These limits are acceptable for the first breadth unit. The purpose is to turn
the existing current-state habit into an installable and checkable process
domain without replacing the human-readable boot projection.
