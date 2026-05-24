---
id: 33
title: "Rename complete profile to full"
status: accepted
date: 2026-05-24
supersedes: []
superseded_by: null
---

# Rename complete profile to full

## Context

The harness currently has two install profiles: a minimal bootstrap profile and
the larger profile containing every implemented process-domain module. That
larger profile was named `dogfood`, because the harness source repo uses it to
dogfood the harness on itself.

That name conflates two ideas:

- dogfooding, which is the practice of using the harness in this source repo;
- the complete install bundle, which should be usable in any target repo that
  wants all current modules.

As the harness becomes more practical for other private repos, the complete
profile needs a name that describes what it installs rather than where it was
first used.

## Decision

Rename the complete profile from `dogfood` to `full`.

The profile file becomes `profiles/full.yaml`, its `profile.id` becomes
`full`, distribution smoke defaults become `minimal` and `full`, and this
source repo's installed manifest records `profile: full`.

Keep the word dogfood for the practice and repo role: this source repo remains
the first dogfood target.

## Consequences

- `harness init --profile full` is now the command for installing every current
  process-domain module.
- `harness profiles switch full --plan` and `harness profiles switch full
  --apply` replace the old `dogfood` profile commands.
- Existing docs and validation references now distinguish the full profile from
  dogfood usage.
- Existing installs that still record `profile: dogfood` will need an explicit
  profile switch or manifest migration if they are upgraded from an older
  harness version.
