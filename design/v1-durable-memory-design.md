# Formal Design: V1 Durable Memory

**Status:** accepted baseline
**Date:** 2026-05-28
**Scope:** durable operator preferences, repo notes, session summaries, and
baseline validation

## Purpose

Durable Memory preserves cross-session context that is useful to future agents
but is not authoritative enough to live in formal decisions, canonical state,
plans, or current status.

The domain exists to reduce repeated orientation cost and preserve operator
preferences without letting memory become an unstructured replacement for the
repo's canonical artifacts.

## Artifacts

The baseline module owns:

- `memory/README.md`
- `memory/operator-preferences.yaml`
- `memory/repo-notes.md`
- `memory/session-summaries.md`

`operator-preferences.yaml` is structured so it can be listed, filtered,
validated, and summarized. Repo notes and session summaries remain Markdown
because they are primarily read during orientation and review.

## Commands

The baseline CLI surface is:

```bash
harness memory list
harness memory check
harness memory report
```

All commands accept `--target <path>`. `list` supports `--status`,
`--category`, `--tag`, and `--json`. `check` and `report` support `--json`.

## Validation

`harness memory check` validates that:

- `memory/operator-preferences.yaml` parses as YAML.
- `memory.version` is supported.
- preference IDs are unique and kebab-case.
- preference statuses are allowed.
- preference category and statement fields are present.
- tags, when present, are lists.
- `memory/README.md`, `memory/repo-notes.md`, and
  `memory/session-summaries.md` exist with expected headings.

`harness doctor` runs this validation when `durable-memory` is installed.

## Boundaries

Durable Memory is not a decision store, current-state projection, or canonical
state registry.

Promotion rules:

- Rationale that explains a durable choice belongs in `decisions/`.
- Active work belongs in `plans/current.yaml` and `status.md`.
- Authoritative repo state belongs in `state/canonical-state.yaml`.
- Short-lived scratch or inbox material belongs in the future Capture And
  Triage domain, not Durable Memory.

## Install Model

`durable-memory` is an installable module and part of the `full` profile. It is
not included in `minimal` because minimal remains a bootstrap profile.

The module's managed files use merge mode so repo-specific memory can be
preserved by installed-instance lifecycle operations.
