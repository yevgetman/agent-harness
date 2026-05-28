# Formal Design: V1 Capture And Triage

**Status:** accepted baseline
**Date:** 2026-05-28
**Scope:** capture inbox, triage register, promotion target metadata, and
baseline validation

## Purpose

Capture And Triage gives not-yet-authoritative material a safe landing place
before it is promoted into a durable process domain.

The domain exists because agents often encounter useful observations, possible
tasks, bugs, questions, and follow-up ideas while doing other work. Without a
structured inbox, those items either disappear into chat history or pollute
authoritative artifacts before they are ready.

## Artifacts

The baseline module owns:

- `capture/README.md`
- `capture/inbox.yaml`
- `capture/triage.yaml`

`capture/inbox.yaml` stores captured items. Each item has an ID, title, kind,
status, summary, source, creation date, promotion target, tags, and optional
references.

`capture/triage.yaml` stores triage records. Each record links to an inbox item
and records whether it was triaged, promoted, deferred, or closed.

## Commands

The baseline CLI surface is:

```bash
harness capture list
harness capture add "<title>"
harness capture triage --id <item-id> --status <status>
harness capture check
harness capture report
```

All commands accept `--target <path>`. `list` supports `--status`, `--kind`,
`--promote-to`, `--tag`, and `--json`. `add`, `triage`, `check`, and `report`
support `--json`.

## Validation

`harness capture check` validates that:

- `capture/inbox.yaml` and `capture/triage.yaml` parse as YAML.
- registry versions are supported.
- inbox item IDs and triage record IDs are unique and kebab-case.
- item and record statuses are allowed.
- item kinds and promotion targets are allowed.
- required item title and summary fields are present.
- triage records reference existing inbox item IDs.
- promoted records name a promotion target.
- `capture/README.md` exists with the expected heading.

`harness doctor` runs this validation when `capture-triage` is installed.

## Boundaries

Capture And Triage is not a replacement for plans, decisions, open questions,
canonical state, or durable memory.

Promotion rules:

- Work that is selected for execution belongs in `plans/current.yaml`.
- Rationale that explains a durable choice belongs in `decisions/`.
- Unresolved uncertainty belongs in `open-questions.yaml`.
- Authoritative repo state belongs in `state/canonical-state.yaml`.
- Stable operator preference or cross-session context belongs in
  `memory/operator-preferences.yaml` or the memory notes.

The first baseline records promotion targets; it does not automatically edit
the promoted target artifact.

## Install Model

`capture-triage` is an installable module and part of the `full` profile. It is
not included in `minimal` because minimal remains a bootstrap profile.

The module's managed files use merge mode so repo-specific captured material
can be preserved by installed-instance lifecycle operations.
