# Formal Design: V1 Lock And Provenance

**Status:** accepted baseline  
**Date:** 2026-05-14  
**Scope:** installed-file provenance, lock shape, validation, and upgrade
planning behavior

This is a formal design document. It defines the first Phase 3 implementation
of lock/provenance state for installed harness targets.

## Purpose

The installed manifest records intended harness state: package, profile,
modules, managed files, commands, and upgrade policy.

The installed lock records observed installed-file provenance: which files the
harness wrote, which module or lifecycle component owns them, and what their
content fingerprint was at install or module-add time.

The lock makes upgrade planning safer by distinguishing:

- files that match the installed baseline
- files that are missing
- files that have been locally modified
- files that are managed by the manifest but not yet locked
- legacy targets with no lock

## Artifact

The lock lives at:

```text
.harness/lock.yaml
```

Initial v1 shape:

```yaml
lock:
  version: 1
  generated_at: 2026-05-14
  package: portable-harness
  harness_version: 0.1.0
  profile: minimal
  source:
    type: package
    package: portable-harness
    channel: dev
  modules:
    - id: agent-operating-contract
      version: 0.1.0
  files:
    - path: AGENTS.md
      owner: agent-operating-contract
      mode: merge
      source: generated
      sha256: <sha256>
```

The lock does not include its own fingerprint. Self-locking would make the file
recursive and would require special canonicalization before hashing.

## Write Behavior

`harness init` writes `.harness/lock.yaml` after planning the install payload.
The lock records fingerprints for all planned non-directory files except the
lock itself, including:

- installed orientation files
- `.harness/manifest.yaml`
- installed module definitions
- module-provided template artifacts

`harness modules add <module>` refreshes the lock after writing artifacts and
updating `.harness/manifest.yaml`. The refresh upserts fingerprints for:

- `.harness/manifest.yaml`
- the installed module definition
- non-directory artifacts written by the module

The first implementation does not yet expose a standalone lock refresh command.
Feature work that intentionally changes locked dogfood files must refresh the
lock before final validation.

## Doctor Behavior

`harness doctor` validates the lock when present:

- `.harness/lock.yaml` has top-level `lock`.
- `lock.version` is `1`.
- `lock.files` is a list.
- file entries have unique paths.
- file entries have valid SHA-256 values.
- locked files exist.
- current file fingerprints match the lock, or produce warnings when they do
  not.
- manifest-managed files, module definitions, and `.harness/manifest.yaml`
  have expected lock entries.

Missing lock state is a warning rather than an error so older initialized
targets can still be diagnosed.

Invalid lock syntax or shape is an error because upgrade planning cannot safely
trust malformed provenance.

## Upgrade Plan Behavior

`harness upgrade --plan` reads the lock and reports lock status.

Managed file states:

- `present-clean`: file exists and matches the lock fingerprint.
- `present-modified`: file exists but differs from the lock fingerprint.
- `present-unlocked`: file exists while a lock exists, but the file has no lock
  entry.
- `present-managed`: legacy fallback; no lock exists, but the file has a
  harness management marker.
- `present-unmarked`: legacy fallback; no lock exists and no marker is found.
- `missing`: file is absent.

Planning effects:

- `missing` managed files are blockers.
- `present-modified` managed files are review-required warnings.
- `present-unlocked` managed files are provenance warnings.
- invalid lock state is a blocker.
- missing lock state is a warning.

This keeps upgrade behavior plan-first: the harness reports what it can safely
infer and defers mutation when provenance is ambiguous.

## Limits

This first implementation is intentionally narrow.

It does not yet:

- compute semantic diffs
- identify which human edited a file
- record template hashes separately from installed file hashes
- support remote package provenance
- apply upgrades
- expose `harness lock refresh`
- merge local edits into upgraded templates

Those are future depth increments after baseline provenance is dogfooded.

## Dogfood Requirement

This repo must carry `.harness/lock.yaml` as installed dogfood state.

Before completing Phase 3 work, run:

```bash
npm run doctor
npm run upgrade:plan
npm test
```

The dogfood repo should end with no doctor errors and no upgrade-plan blockers.
