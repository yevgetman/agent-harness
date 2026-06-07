---
id: 44
title: "Adopt rollback planning from lifecycle backups"
status: accepted
date: 2026-06-07
supersedes: []
superseded_by: null
---

# Adopt rollback planning from lifecycle backups

## Context

Lifecycle backups now create local recovery snapshots before supported
mutation surfaces write, edit, or delete existing files.

Those snapshots are useful only if an operator can inspect them consistently
after a failed or partial apply. The harness should make recovery state
legible before it adds any restore behavior, and it should preserve the
plan-first lifecycle model.

## Decision

Add a read-only rollback planning surface:

```bash
harness rollback --plan
harness rollback --plan --backup <backup-path-or-id>
harness rollback --plan --json
```

The command reads lifecycle backup manifests from `.harness/backups/` and
`.harness-destroy-backups/`. Without `--backup`, it selects the newest backup
manifest by creation time.

Rollback planning verifies each backup copy against its recorded SHA-256,
compares each backed-up file to the current target file, and classifies
operations as safe, review-required, or blocked.

The first rollback increment is plan-only. It does not restore files. Restore
or rollback apply behavior needs a separate decision after the read-only plan
has dogfood evidence.

## Consequences

- Operators and agents can inspect what a backup could recover without
  mutating the repo.
- Missing target files can be classified as safe restore candidates when the
  backup copy is intact.
- Existing target files that differ from the backup are review-required because
  restoring would overwrite current content.
- Missing or corrupted backup copies are blockers.
- Future restore behavior should consume the rollback plan and backup
  manifests rather than inventing another recovery model.
