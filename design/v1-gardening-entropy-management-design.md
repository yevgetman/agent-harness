# Formal Design: V1 Gardening And Entropy Management

**Status:** accepted baseline
**Date:** 2026-06-03
**Scope:** local gardening rules, configurable cleanup thresholds, reviewed
cleanup policy, read-only cleanup recommendations, commands, and validation

## Purpose

Gardening And Entropy Management helps an installed harness target notice when
durable harness state is becoming stale, noisy, oversized, or ready for
reviewed cleanup.

The baseline is read-only. It reports cleanup pressure across capture, plans,
status projection, memory, reports, snapshots, and lock health without mutating
target files. This gives agents and operators a practical cleanup view while
preserving the existing review boundary for deletion, archive, or rewrite work.

## Artifacts

The baseline module owns:

- `gardening/README.md`
- `gardening/rules.yaml`
- `gardening/snapshots.md`

`gardening/rules.yaml` stores structured cleanup rule definitions, threshold
configuration, and reviewed cleanup policy. Each rule has an ID, title, kind,
status, severity, summary, optional sources, and tags.

Thresholds define when plan findings become recommendations or warnings for
open capture items, completed plans, deferred plans, status lines, session
summary lines, and snapshot lines.

The action policy keeps the baseline read-only while naming reviewed cleanup
actions. Deleting files, rewriting human-authored content, or archiving managed
artifacts must remain prohibited without a future explicit confirmation
workflow.

`gardening/snapshots.md` stores durable garden plan snapshots or cleanup notes
when a target needs a human-readable entropy record across sessions.

## Commands

The baseline CLI surface is:

```bash
harness garden list
harness garden check
harness garden report
harness garden plan
```

All commands accept `--target <path>`. `list` supports `--status`, `--kind`,
`--severity`, `--tag`, and `--json`. `check`, `report`, and `plan` support
`--json`.

## Validation

`harness garden check` validates that:

- `gardening/rules.yaml` parses as YAML.
- `gardening.version` is supported.
- rule IDs are unique and kebab-case.
- rule kinds, statuses, and severities are allowed.
- required title, kind, status, severity, and summary fields are present.
- sources and tags are lists when present.
- thresholds are known objects with non-negative integer recommendation and
  warning values.
- warning thresholds are greater than or equal to recommendation thresholds.
- action policy lists contain non-empty strings and use the read-only default.
- local source references are reported as warnings when missing.
- `gardening/README.md` and `gardening/snapshots.md` exist with expected
  headings.

`harness doctor` runs this validation when `gardening-entropy-management` is
installed.

## Plan Baseline

`harness garden plan` inspects local target state and reports findings for:

- lock health and missing lock entries,
- open capture inbox items,
- completed or deferred plan volume,
- long status projections,
- memory/session-summary size,
- report and gardening snapshot size.

The command uses configured thresholds from `gardening/rules.yaml` when present
and falls back to built-in defaults otherwise. Findings include action labels,
such as `triage-or-promote-capture`, `review-plan-archive`,
`review-status-trim`, `review-memory-summary-trim`, `review-snapshot-trim`, or
`review-lock-refresh`.

The command does not write files, delete files, archive plans, or trim
projections. Action labels describe review paths, not automatic mutations.

## Boundaries

This domain is not a replacement for `harness reconcile plan`,
`harness capture report`, `harness plans report`, or `harness lock check`. It
composes selected local checks into a cleanup-pressure view so agents can see
what may need pruning before deciding which command or manual review should
handle it.

The baseline does not implement gardening apply, stale artifact deletion,
automatic archive moves, or report snapshot trimming. Those remain future
reviewed lifecycle work and should require a separate decision, tests, and
confirm-gated operation contract.

## Install Model

`gardening-entropy-management` is an installable module and part of the `full`
profile. It is not included in `minimal` because minimal remains a bootstrap
profile.

The module's managed files use merge mode so repo-specific rules and snapshots
can be preserved by installed-instance lifecycle operations.
