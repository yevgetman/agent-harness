---
id: 43
title: "Adopt lifecycle backups before safe mutations"
status: accepted
date: 2026-06-07
supersedes: []
superseded_by: null
---

# Adopt lifecycle backups before safe mutations

## Context

V1.1 is moving from read-only inspection and narrow safe apply into private
production hardening. The harness can already mutate installed repos through
module add, profile switch apply, upgrade apply, and confirmed destroy.

Those mutations are intentionally narrow and classified as safe, but private
repo use still needs an operator recovery point before files are changed or
removed. This is especially important for package-script repair, lock refresh,
template cascade updates, profile/module installs, and destroy teardown.

## Decision

Create local lifecycle backups before supported mutation surfaces write, edit,
or delete existing files.

Normal lifecycle applies write backup snapshots under `.harness/backups/`.
Confirmed destroy writes under `.harness-destroy-backups/` so the snapshot
survives removal of `.harness/`.

Backups copy existing files only. Missing paths and skipped excluded paths are
recorded in a backup manifest. Backup manifests record purpose, creation time,
target root, file paths, backup paths, and SHA-256 fingerprints.

The first covered mutation surfaces are:

- `harness modules add`
- `harness profiles switch --apply`
- `harness upgrade` / `harness upgrade apply`
- `harness destroy --confirm`

The backup is a recovery aid, not automatic rollback. Rollback planning remains
future work.

## Consequences

- Installed repos get a local recovery snapshot before supported safe
  mutations.
- Backups are ignored as local/transient state and should not be committed.
- Destroy snapshots survive confirmed teardown by using a sibling backup root.
- Apply commands now report backup metadata in JSON and print the backup path
  when one is created.
- Future rollback behavior should consume these manifests rather than
  inventing a second snapshot format.
