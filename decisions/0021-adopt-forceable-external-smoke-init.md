---
id: 21
title: "Adopt explicit force init overwrite contract"
status: accepted
date: 2026-05-16
supersedes: []
superseded_by: null
---

# Adopt explicit force init overwrite contract

## Context

The first named real-repo smoke target, `~/code/meetingly`, already has an
`AGENTS.md` file. The copied external-target smoke correctly left the source
repo untouched, but `harness init` refused the copied target because bootstrap
files already existed.

That refusal is the right default for real installs. For distribution smoke,
however, the target is already a disposable copy. The smoke workflow needs a
way to validate package install, init, doctor, and upgrade behavior against
real repo shapes that already have agent or harness bootstrap files.

More generally, the initialization contract needs to be explicit: normal init
should warn and refuse when planned harness artifacts already exist, and
`init --force` should definitively overwrite the planned harness process in the
target repo.

## Decision

Keep normal `harness init` collision-averse, but make the warning explicit.
When planned harness artifacts already exist, init reports the collisions and
tells the caller to rerun with `--force` to overwrite them.

Treat `harness init --force` as the definitive overwrite path for the planned
harness artifacts in the target repo. It writes the selected profile's
operating contract, orientation files, manifest, lock, module definitions, and
module artifacts over existing files.

Add `--force` to `harness distribution smoke`.

When provided, the smoke command passes `--force` to the packaged
`harness init` invocation inside the temporary smoke target. The source target
is still copied first, and the original repo is not mutated.

The default remains collision-averse: external smoke without `--force` still
surfaces init collisions.

## Consequences

- Normal init remains safe for accidental installs into existing repos.
- Forced init has clear semantics: replace the harness/process artifacts for
  the selected profile instead of merging them.
- Named real-repo smoke can validate repos that already have `AGENTS.md` or
  other bootstrap files.
- Collision-safe behavior remains the default.
- Forced smoke is only an installation compatibility check; it does not mean
  force-install should be the default recommendation for real target adoption.
- The next Phase 5 check should rerun `meetingly` smoke with `--force` for the
  minimal profile, then the dogfood profile if appropriate.
