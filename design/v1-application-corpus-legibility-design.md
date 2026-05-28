# Formal Design: V1 Application / Corpus Legibility

**Status:** accepted baseline
**Date:** 2026-05-28
**Scope:** repo inspection inventory, legibility notes, baseline commands, and
validation

## Purpose

Application / Corpus Legibility makes the target repo's subject matter
inspectable by agents.

The domain exists because an installed harness should not only describe agent
workflow; it should also make it clear how to inspect the actual thing the repo
contains. In an application repo, that means boot commands, tests, health
checks, fixtures, logs, screenshots, metrics, traces, and runtime notes. In a
document or corpus repo, that means indexes, source maps, freshness checks,
generated summaries, and corpus-specific inspection notes.

## Artifacts

The baseline module owns:

- `legibility/README.md`
- `legibility/inventory.yaml`
- `legibility/notes.md`

`legibility/inventory.yaml` stores structured inspection surfaces. Each
surface has an ID, title, kind, status, summary, inspection guidance, optional
commands, optional references, and tags.

`legibility/notes.md` stores repo-specific inspection notes that are useful to
future agents but do not fit as structured inventory entries yet.

## Commands

The baseline CLI surface is:

```bash
harness legibility list
harness legibility check
harness legibility report
```

All commands accept `--target <path>`. `list` supports `--status`, `--kind`,
`--tag`, and `--json`. `check` and `report` support `--json`.

## Validation

`harness legibility check` validates that:

- `legibility/inventory.yaml` parses as YAML.
- `legibility.version` is supported.
- inventory surface IDs are unique and kebab-case.
- surface kinds and statuses are allowed.
- required title, summary, and inspection guidance fields are present.
- commands, references, and tags are lists when present.
- local references are reported as warnings when missing.
- `legibility/README.md` and `legibility/notes.md` exist with expected
  headings.

`harness doctor` runs this validation when `application-corpus-legibility` is
installed.

## Boundaries

Application / Corpus Legibility is not a replacement for Mechanical
Validation. It records how to inspect the repo and what inspection surfaces
exist; it does not decide whether every check should pass.

It is also not a report generator. Reports And Retrieval should later compose
legibility inventory with metadata, state, plans, memory, and validation
results into cross-domain summaries.

## Install Model

`application-corpus-legibility` is an installable module and part of the
`full` profile. It is not included in `minimal` because minimal remains a
bootstrap profile.

The module's managed files use merge mode so repo-specific inspection
inventory and notes can be preserved by installed-instance lifecycle
operations.
