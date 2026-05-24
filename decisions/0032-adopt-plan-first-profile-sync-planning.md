---
id: 32
title: "Adopt plan-first profile sync planning"
status: accepted
date: 2026-05-24
supersedes: []
superseded_by: null
---

# Adopt plan-first profile sync planning

## Context

V1.1 installed-instance behavior needs a way for a target repo to inspect
whether its locally recorded active profile is satisfied without switching to a
different profile.

`harness profiles inspect <profile>` can inspect a named source profile, and
`harness profiles switch <profile>` can plan or apply transitions to a
requested profile. Neither command answers the simpler installed-instance
question: "Given this target's current manifest profile, are the expected
modules installed, which clean modules could be added, and which retained
modules are outside the active profile?"

Profile sync should preserve the v1.1 architecture boundary. The source repo
defines profiles and module behavior, but it does not know where the harness is
installed and does not coordinate target repos centrally.

## Decision

Add `harness profiles sync --plan [--target <path>] [--json]` as the first
profile sync increment.

The command is read-only. It:

- loads the target manifest;
- uses `harness.profile` as the active source profile;
- reuses existing profile inspection and module-add preflight behavior;
- reports installed active-profile modules as `safe/sync-module-present`;
- reports clean missing active-profile modules as `safe/sync-module-install`;
- reports artifact or command collisions as
  `review/sync-module-install-collision`;
- reports unavailable or unsupported active-profile module states as blocked;
- reports installed modules outside the active profile as
  `deferred/profile-module-retained`; and
- records `deferred/sync-apply-not-implemented` because sync apply is not part
  of this increment.

The command does not accept a profile argument and does not mutate the target.

## Consequences

- Installed repos can inspect whether their active profile is satisfied without
  manually naming that profile or switching profiles.
- The output becomes a useful preflight for future profile sync apply.
- Missing active-profile modules now have a profile-specific planning surface
  outside the broader upgrade planner.
- Sync apply remains deferred; clean missing modules can still be installed by
  `modules add`, profile switch apply, or a future sync apply increment.
- The next roadmap step is process-domain breadth, but that work should pause
  for operator confirmation before implementation.
