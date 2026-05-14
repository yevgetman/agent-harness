# Harness Status

Last updated: 2026-05-14

## Current Phase

Design baseline and dogfood bootstrap, with Progressive Orientation now being
dogfooded.

The repo currently has exploratory specs, three formal v1 design documents, a
root agent operating contract, a current-state status projection, a minimal
orientation path with `index.yaml`, a dogfood installed manifest, two initial
module definitions, a runnable `harness doctor` command, and a minimal
`harness init --profile minimal` installer. No upgrade command, profile system
beyond `minimal`, or full CLI exists yet.

Remote: `git@github.com:yevgetman/agent-harness.git`

## Current Decisions

- The top-level v1 workflow model is **15 formal harness process domains**, not
  the full 37-item exploratory shape catalog.
- The 37-item shape catalog remains supporting vocabulary and capability
  inventory.
- Canonical term: **harness process domain**. Casual shorthand: **process
  domain**.
- `~/code/harness` is both the harness source repo and the first dogfood target.
- `~/code/me` is deferred until the harness is more mature.
- `status.md` is a current-state projection, not a changelog; agents should edit
  it in place after significant changes.
- Progressive Orientation is the first explicitly dogfooded process domain:
  agents start with `AGENTS.md`, `status.md`, `index.yaml`, and
  `state/CONTEXT.md` before opening deeper docs.
- `index.yaml` is currently an orientation manifest, not yet a mechanically
  enforced document registry.
- Installed harness state is recorded at `.harness/manifest.yaml`.
- The first two module definitions are `agent-operating-contract` and
  `progressive-orientation`.
- `npm run doctor` is the first Mechanical Validation surface; it validates
  installed harness health, not the full repo content.
- `npm run init` installs the minimal profile into a target repo: `AGENTS.md`,
  `status.md`, `index.yaml`, `state/CONTEXT.md`, `.harness/manifest.yaml`, and
  the two initial module definitions.
- `npm test` covers minimal init, doctor success, overwrite refusal,
  `--force`, and unsupported profile failure.
- GitHub remote is `yevgetman/agent-harness` and is private at creation.
- Short-term build strategy is **incremental tooling plus process-domain
  integration**: each process-domain integration should force concrete tooling,
  and each tooling improvement should serve an already dogfooded domain.

## Active Artifacts

- `AGENTS.md` — current agent operating contract for this repo.
- `index.yaml` — current orientation manifest and reading order.
- `state/CONTEXT.md` — condensed context briefing for fresh agents.
- `design/v1-process-domain-design.md` — formal v1 process-domain design
  baseline.
- `design/v1-installed-manifest-design.md` — formal installed-manifest design
  baseline.
- `design/v1-incremental-build-strategy.md` — formal short-term build strategy.
- `.harness/manifest.yaml` — dogfood installed harness manifest.
- `modules/*/module.yaml` — first two module definitions.
- `scripts/harness.mjs` / `scripts/init.mjs` / `scripts/doctor.mjs` — minimal
  CLI, installer, and doctor command.
- `scripts/test.mjs` — basic executable tests for the init/doctor loop.
- `spec/agnostic-harness-shape.md` — exploratory catalog of harness process
  domains and supporting capabilities.
- `spec/portability-model.md` — exploratory portability model and install
  sketch.

## Next Work

- Decide whether `index.yaml` remains an orientation-only manifest for now or
  becomes the first mechanically validated artifact.
- Decide whether `harness doctor` should stay installation-health-only or
  become a broader repo health surface.
- Add the next process domain only when it forces one concrete tooling
  improvement.
- Decide whether the next tool should be `harness add-module`, broader
  `doctor`, or a decisions/open-questions module.

## Open Questions

- Which distribution target should be assumed first: Bun, npm, Homebrew, or
  standalone binary?
