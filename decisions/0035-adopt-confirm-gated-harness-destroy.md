---
id: 35
title: "Adopt confirm-gated harness destroy"
status: accepted
date: 2026-05-25
supersedes: []
superseded_by: null
---

# Adopt confirm-gated harness destroy

## Context

The harness has an install command, `harness init`, but until now it had no
inverse command for removing an installed harness from a target repo.

Installed targets can contain both harness-owned artifacts and pre-existing
human-authored files. Files such as `AGENTS.md`, `status.md`,
`state/CONTEXT.md`, and `.gitignore` may have local content that should remain
after teardown, while the harness-owned sections inside those files should be
removed.

The command is destructive by nature. It must remove installed lifecycle state,
module definitions, and module artifacts, but it must not remove the target
repo's git history or hide the destructive operation behind a casual default.

## Decision

Adopt `harness destroy` as the installed-instance teardown surface.

Bare `harness destroy` is read-only and prints a teardown plan. Confirmed
teardown requires `harness destroy --confirm`.

Confirmed teardown preserves `.git/`, removes `.harness/`, installed module
definitions, module artifacts, and managed files, and removes empty parent
directories when possible.

Human-facing files with harness-owned marker sections are surgically edited:
the marked section is removed when local content remains, and generated-only
files are deleted. Files without a safe harness-owned section boundary are
treated as harness artifacts and deleted on confirmed teardown.

## Consequences

- Operators get a clear off-ramp for installed repos without deleting git
  history.
- Accidental bare `harness destroy` runs are non-mutating.
- Current marker-based files such as `AGENTS.md` and `.gitignore` can be
  cleaned without deleting unrelated local instructions or ignore rules.
- Structured files without a precise reverse merge are removed as harness
  artifacts. That is simpler and more predictable than trying to infer which
  YAML entries were human-authored after install.
- Future teardown deepening can add richer reverse-merge support for structured
  files if real target repos need it.
