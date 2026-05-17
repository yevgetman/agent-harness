---
id: 26
title: "Adopt v1.1 private fleet cascade roadmap"
status: superseded
date: 2026-05-17
supersedes: []
superseded_by: 27
---

# Adopt v1.1 private fleet cascade roadmap

**Superseded by:** `decisions/0027-adopt-standalone-installed-instance-upgrade-model.md`

## Context

V1 proved the portable harness can be installed, validated, packaged as a local
tarball, extended with modules, and planned for upgrades.

The next product need is not public publication. The near-term purpose is a
practical private harness that Julie can install into her own project repos so
agents inherit the same operating rules and workflow scaffolds without manual
setup in each repo.

Core harness improvements should be able to cascade into already-initialized
target repos through inspection, planning, safe apply, and review-required
boundaries.

## Decision

Adopt the now-replaced private-fleet roadmap as the current post-v1 product
direction.

V1.1 will prioritize private target-repo durability, target registry, profile
switching, cascade upgrade planning, remaining process-domain baselines,
dogfood robustness, and real-repo evidence.

Public npm publication, alternate distribution channels, and public-facing
polish remain deferred unless a later decision explicitly reopens them.

## Consequences

- Product and roadmap decisions should read the v1.1 roadmap before using the
  v1 closeout roadmap for sequencing.
- Distribution smoke remains useful validation machinery, but it is no longer
  the primary build direction.
- The next recommended build step becomes a private target registry rather
  than public publication or more distribution polish.
- Profile switching remains important, but should follow the target registry so
  switching and cascade behavior can be validated against known target repos.
- Remaining process domains should be added as executable, installable, or
  validated behavior rather than prose-only docs.

## Supersession Note

This decision incorrectly framed the harness source repo as aware of, or able
to centrally manage, a private fleet of installed target repos. Decision 0027
replaces that with the installed-instance model: the source repo defines the
tool, and each installed repo owns its local harness state and upgrade process.
