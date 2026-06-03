# Formal Design: V1 Reconciliation And Drift Detection

**Status:** accepted baseline
**Date:** 2026-06-03
**Scope:** local drift rules, plan-only reconciliation reports, baseline
commands, and validation

## Purpose

Reconciliation And Drift Detection helps an installed harness target compare
its local harness state against the source of truth it already carries.

The baseline is plan-only. It reports drift between manifest, lock, profile,
module, command, metadata, state, and plan artifacts without mutating target
files. This keeps the domain useful immediately while preserving the existing
review boundary for file changes.

## Artifacts

The baseline module owns:

- `reconciliation/README.md`
- `reconciliation/rules.yaml`
- `reconciliation/snapshots.md`

`reconciliation/rules.yaml` stores structured drift rule definitions. Each rule
has an ID, title, kind, status, severity, summary, optional sources, and tags.

`reconciliation/snapshots.md` stores durable plan snapshots or notes when a
target needs a human-readable drift record across sessions.

## Commands

The baseline CLI surface is:

```bash
harness reconcile list
harness reconcile check
harness reconcile report
harness reconcile plan
```

All commands accept `--target <path>`. `list` supports `--status`, `--kind`,
`--severity`, `--tag`, and `--json`. `check`, `report`, and `plan` support
`--json`.

## Validation

`harness reconcile check` validates that:

- `reconciliation/rules.yaml` parses as YAML.
- `reconciliation.version` is supported.
- rule IDs are unique and kebab-case.
- rule kinds, statuses, and severities are allowed.
- required title, kind, status, severity, and summary fields are present.
- sources and tags are lists when present.
- local source references are reported as warnings when missing.
- `reconciliation/README.md` and `reconciliation/snapshots.md` exist with
  expected headings.

`harness doctor` runs this validation when
`reconciliation-drift-detection` is installed.

## Plan Baseline

`harness reconcile plan` inspects local target state and reports findings for:

- missing manifest or lock state,
- manifest-managed files that are missing,
- lock entries that are missing, stale, or incomplete,
- active profile modules that are missing from the installed manifest,
- installed modules absent from the source module registry,
- command wiring drift,
- metadata, canonical-state, and plans/status validation drift when those
  artifacts are present.

The command does not write files and does not repair drift.

## Boundaries

This domain is not a replacement for `harness upgrade --plan`, `harness doctor`,
or `harness lock check`. It composes selected local checks into a reconciliation
view so agents can see drift before deciding which command or manual review
should handle it.

The baseline does not implement reconciliation apply, semantic merge repair, or
automated cleanup. Those remain future lifecycle or gardening work.

## Install Model

`reconciliation-drift-detection` is an installable module and part of the
`full` profile. It is not included in `minimal` because minimal remains a
bootstrap profile.

The module's managed files use merge mode so repo-specific rules and snapshots
can be preserved by installed-instance lifecycle operations.
