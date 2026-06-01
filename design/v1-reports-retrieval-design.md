# Formal Design: V1 Reports And Retrieval

**Status:** accepted baseline
**Date:** 2026-06-01
**Scope:** cross-domain report catalog, generated installed-repo overview,
baseline commands, and validation

## Purpose

Reports And Retrieval turns installed harness state into useful summaries that
agents can request without manually inspecting every process-domain artifact.

The baseline is intentionally practical and local. It composes structured files
that already exist in the target repo, such as manifest, metadata, canonical
state, plans, capture, memory, and legibility registries. It does not add heavy
retrieval, chunking, embeddings, or external indexes.

## Artifacts

The baseline module owns:

- `reports/README.md`
- `reports/catalog.yaml`
- `reports/snapshots.md`

`reports/catalog.yaml` stores report definitions. Each report has an ID, title,
kind, status, summary, optional sources, and tags.

`reports/snapshots.md` stores human-readable report notes or copied command
output when an installed repo needs a durable snapshot.

## Commands

The baseline CLI surface is:

```bash
harness reports list
harness reports check
harness reports report
harness reports generate
```

All commands accept `--target <path>`. `list` supports `--status`, `--kind`,
`--tag`, and `--json`. `check`, `report`, and `generate` support `--json`.
`generate` also accepts `--report <id>`.

## Validation

`harness reports check` validates that:

- `reports/catalog.yaml` parses as YAML.
- `reports.version` is supported.
- report definition IDs are unique and kebab-case.
- report kinds and statuses are allowed.
- required title, kind, status, and summary fields are present.
- sources and tags are lists when present.
- local source references are reported as warnings when missing.
- `reports/README.md` and `reports/snapshots.md` exist with expected headings.

`harness doctor` runs this validation when `reports-retrieval` is installed.

## Retrieval Baseline

The first `harness reports generate` implementation produces an installed
harness overview by reading local target files. It summarizes installed modules,
managed files, commands, metadata artifacts, canonical-state entries, plans,
capture items, triage records, memory preferences, legibility surfaces, report
definitions, decision records, and open questions when those sources exist.

Missing optional sources are warnings, not failures. This keeps reports useful
for partial profiles and for repos that have not installed every process
domain.

## Boundaries

Reports And Retrieval is not the source of truth for the underlying domains.
It summarizes local state owned by the other domains.

The baseline does not implement semantic retrieval, search ranking, embeddings,
long-term report persistence, or automated stale-report cleanup. Those can be
added after the cross-domain report catalog is dogfooded.

## Install Model

`reports-retrieval` is an installable module and part of the `full` profile. It
is not included in `minimal` because minimal remains a bootstrap profile.

The module's managed files use merge mode so repo-specific report definitions
and snapshots can be preserved by installed-instance lifecycle operations.
