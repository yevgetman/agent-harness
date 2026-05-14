# Harness Status

Last updated: 2026-05-14

## Current Phase

Design baseline and dogfood bootstrap, with Progressive Orientation now being
dogfooded.

The repo currently has exploratory specs, two formal v1 design documents, a
root agent operating contract, a current-state status projection, a minimal
orientation path with `index.yaml`, a dogfood installed manifest, two initial
module definitions, and a runnable `harness doctor` command. No installer,
upgrade command, profile system, or full CLI exists yet.

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
- GitHub remote is `yevgetman/agent-harness` and is private at creation.

## Active Artifacts

- `AGENTS.md` — current agent operating contract for this repo.
- `index.yaml` — current orientation manifest and reading order.
- `state/CONTEXT.md` — condensed context briefing for fresh agents.
- `design/v1-process-domain-design.md` — formal v1 process-domain design
  baseline.
- `design/v1-installed-manifest-design.md` — formal installed-manifest design
  baseline.
- `.harness/manifest.yaml` — dogfood installed harness manifest.
- `modules/*/module.yaml` — first two module definitions.
- `scripts/harness.mjs` / `scripts/doctor.mjs` — minimal CLI and doctor command.
- `spec/agnostic-harness-shape.md` — exploratory catalog of harness process
  domains and supporting capabilities.
- `spec/portability-model.md` — exploratory portability model and install
  sketch.

## Next Work

- Decide whether `index.yaml` remains an orientation-only manifest for now or
  becomes the first mechanically validated artifact.
- Decide the first `harness init` behavior and whether it installs only
  `agent-operating-contract` + `progressive-orientation`.
- Decide whether `harness doctor` should stay installation-health-only or
  become a broader repo health surface.
- Add tests around doctor behavior before expanding validation.

## Open Questions

- What is the minimum module set for `harness init`?
- Which distribution target should be assumed first: Bun, npm, Homebrew, or
  standalone binary?
