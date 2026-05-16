---
id: 22
title: "Close Phase 5 with local tarball distribution"
status: accepted
date: 2026-05-16
supersedes: []
superseded_by: null
---

# Close Phase 5 with local tarball distribution

## Context

Phase 5 Distribution Readiness now validates explicit package contents, packed
npm tarball installation, release preflight, registry version discovery,
external-target smoke, guarded publish planning, and forced init inside copied
smoke targets.

The first named real-repo target, `~/code/meetingly`, passed packed-package
distribution smoke for both the `minimal` and `dogfood` profiles when the
temporary copied target used `harness init --force`. The original `meetingly`
repo remained unchanged.

Registry publication is still blocked by intentional release blockers:
`private: true` and `license: UNLICENSED`. Publishing is deferred for now.

## Decision

Close Phase 5 for v1 with local packed npm tarball distribution as the proven
distribution path.

Treat npm registry publication as deferred, not as a v1 blocker. The guarded
publish plan and release preflight remain in place so publication can resume
later with an explicit release-license and publication decision.

## Consequences

- V1 can move to closeout hardening without clearing registry publication
  blockers.
- The v1 install story is local tarball/package installation plus smoke
  validation, not public npm install.
- Future release work must intentionally choose a release license, clear
  `private: true`, and rerun release and publish planning.
- The next work is v1 closeout: final validation matrix, docs/status cleanup,
  and clear notes on deferred post-v1 behavior.
