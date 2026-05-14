---
id: 5
title: "Adopt profile-backed init and profile listing"
status: accepted
date: 2026-05-14
supersedes: []
superseded_by: null
---

# Adopt profile-backed init and profile listing

## Context

`harness init --profile minimal` originally hardcoded the minimal file plan
inside the init command. That kept the first installer small, but it meant
profile records under `profiles/` were descriptive rather than operational.

The previous module/profile increment made modules listable and installable.
The next useful depth step is to make profiles listable and make init consume
profile definitions directly, without adding profile switching or a broader
package manager yet.

## Decision

Add `harness profiles list` and make `harness init --profile <profile>` read
profile module bundles from `profiles/*.yaml`.

For now, init still requires the `agent-operating-contract` and
`progressive-orientation` bootstrap modules because generated target repos need
an operating contract and progressive orientation path. Additional profile
modules may contribute module definitions, managed files, commands, and install
artifacts through their existing module metadata.

## Consequences

- Profiles become executable installation inputs rather than orientation-only
  records.
- The `dogfood` profile can be installed into a temp target and validated.
- Future profiles can bundle process-domain modules without changing init
  logic, as long as those modules define compatible install metadata.
- Profile switching, profile removal, and profile dependency solving remain out
  of scope.
- The generated target manifest now includes `profiles-list` alongside module
  and upgrade commands.
