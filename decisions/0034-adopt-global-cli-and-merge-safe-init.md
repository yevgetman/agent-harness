---
id: 34
title: "Adopt global CLI and merge-safe init"
status: accepted
date: 2026-05-24
supersedes:
  - 21
superseded_by: null
---

# Adopt global CLI and merge-safe init

## Context

The harness package already exposes a `harness` binary, but the documented
operator flow still treats the CLI as mostly repo-local through
`./node_modules/.bin/harness`. That makes setup noisier than the intended
private utility model.

The desired installed-instance workflow is closer to a machine-level CLI:
install the harness tool once, `cd` into a repo, run `harness init`, then use
`harness doctor` and `harness upgrade` inside that repo.

The earlier init contract made `--force` the definitive overwrite path for
planned harness artifacts. That is too destructive for real repos. Existing
files such as `AGENTS.md` may contain repo-specific instructions that must be
preserved even when adding the portable harness.

## Decision

Adopt a global CLI workflow and merge-safe initialization contract.

`harness init` now defaults to the complete `full` profile. Operators can still
request `--profile minimal` explicitly when they want only the bootstrap
profile.

A globally installed `harness` command is a supported install path for private
use. Distribution validation includes a global-prefix smoke test that installs
the packed package into a temporary global npm prefix, changes into a target
repo, runs bare `harness init`, validates the target, and runs bare
`harness upgrade`.

`harness init` must not overwrite human-authored content. Existing
human-facing files are merged by adding or replacing harness-owned marked
sections. Existing structured files are merged where the harness has a safe
structured merge path. If a file cannot be merged safely, init fails rather
than overwriting it.

`--force` remains accepted for compatibility with older smoke and operator
commands, but it no longer authorizes overwriting human-authored content.

`harness upgrade` with no subcommand now runs the supported safe apply path.
`harness upgrade --plan` remains the explicit read-only planning command.

## Consequences

- The fastest setup path becomes `harness init` from inside the target repo.
- The default installed profile becomes `full`, so new repos receive every
  current process-domain module unless `minimal` is requested explicitly.
- Existing repo instructions survive initialization and repeated init runs are
  idempotent for harness-owned sections.
- Destructive init overwrite semantics from decision 21 are superseded for real
  initialization. Forceable external smoke can still pass `--force`, but the
  flag is compatibility-only.
- Merge-aware structured files are still intentionally narrow. Future work
  should deepen semantic merge support for more YAML shapes and review flows.
- Bare `harness upgrade` becomes more practical, but it continues to refuse
  blocked or review-required plans before mutating.
