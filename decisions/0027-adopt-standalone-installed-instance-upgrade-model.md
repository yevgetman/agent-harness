---
id: 27
title: "Adopt standalone installed-instance upgrade model"
status: accepted
date: 2026-05-17
supersedes: [26]
superseded_by: null
---

# Adopt standalone installed-instance upgrade model

## Context

Decision 0026 correctly deprioritized public distribution, but incorrectly
framed the source repo as a command center or target registry for installed
repos.

The intended architecture is a standalone harness tool. The source repo defines
the tool, modules, profiles, templates, validations, and upgrade behavior. It
does not know where the harness is installed. Each target repo owns its local
installed harness state and runs its own commands.

This matches a CLI installation model: installing or upgrading the tool gives
an installed instance new capabilities, but the tool source does not keep a
central list of installations.

## Decision

Adopt `design/v1.1-installed-instance-roadmap.md` as the current post-v1
product direction.

V1.1 will prioritize installed-repo autonomy, clearer upgrade source/channel
semantics, plan-first repo-local upgrades, profile switching, remaining
process-domain baselines, dogfood robustness, and copied real-repo validation.

The source repo must not add a source-owned target registry or fleet-wide
command-center behavior.

## Consequences

- Decision 0026 is superseded.
- Product and roadmap decisions should read the installed-instance roadmap
  before using v1 closeout docs for sequencing.
- The next recommended build step becomes the installed-instance upgrade
  contract rather than a private target registry.
- Profile switching remains important, but should follow upgrade-contract
  clarification so installed repos can upgrade independently.
- Cascading upgrades happen by running the upgraded harness tool inside each
  installed repo, not by orchestrating targets from the source repo.
- Real-repo dogfood should use copied targets or explicit per-repo commands,
  without storing a central installation registry in the source repo.
