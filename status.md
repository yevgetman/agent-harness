# Harness Status

Last updated: 2026-05-14

## Current Phase

Design baseline and dogfood bootstrap, with the current work focused on
deepening the already-integrated domains before adding more breadth.

The repo currently has exploratory specs, four formal v1 design documents, a
root agent operating contract, a current-state status projection, a minimal
orientation path with `index.yaml`, a dogfood installed manifest, three active
module definitions, a runnable `harness doctor` command, and a minimal
`harness init --profile minimal` installer. Decisions And Open Questions is
dogfooded with `decisions/`, `open-questions.yaml`, a decision template,
decision and question list commands, a decision creation command, and doctor
validation. No upgrade command, profile system beyond `minimal`, or full CLI
exists yet.

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
- Active module definitions are `agent-operating-contract`,
  `progressive-orientation`, and `decisions-open-questions`.
- `npm run doctor` is the first Mechanical Validation surface; it validates
  installed harness health plus Decisions And Open Questions shape when that
  module is installed.
- `npm run init` installs the minimal profile into a target repo: `AGENTS.md`,
  `status.md`, `index.yaml`, `state/CONTEXT.md`, `.harness/manifest.yaml`, and
  the two initial module definitions.
- `npm test` covers minimal init, doctor success, overwrite refusal,
  `--force`, unsupported profile failure, and decision creation.
- `npm run decisions:new -- "<title>"` creates the next decision record under
  `decisions/`.
- GitHub remote is `yevgetman/agent-harness` and is private at creation.
- Short-term build strategy is **incremental tooling plus process-domain
  integration**: each process-domain integration should force concrete tooling,
  and each tooling improvement should serve an already dogfooded domain.
- Second-layer build strategy is **add breadth, then work depth to the maximum
  prudent extent before adding more breadth**. This is specific to building this
  repo and is not a harness process domain or portable default behavior.
- `npm run init` now supports `--dry-run`, refuses non-git targets unless
  `--allow-non-git` is passed, reports install plans, and writes package,
  version, and profile metadata into generated files.
- `npm run doctor` now groups diagnostics, deduplicates repeated file checks,
  emits remediation hints, validates `index.yaml` dependencies, and checks
  manifest/module managed-file consistency.
- `npm run decisions:list` lists decision records.
- `npm run questions:list` lists open questions.

## Active Artifacts

- `AGENTS.md` — current agent operating contract for this repo.
- `index.yaml` — current orientation manifest and reading order.
- `state/CONTEXT.md` — condensed context briefing for fresh agents.
- `design/v1-process-domain-design.md` — formal v1 process-domain design
  baseline.
- `design/v1-installed-manifest-design.md` — formal installed-manifest design
  baseline.
- `design/v1-incremental-build-strategy.md` — formal short-term build strategy.
- `design/v1-decisions-open-questions-design.md` — formal Decisions And Open
  Questions domain design.
- `docs/minimal-profile.md` — reference for the current minimal install
  profile.
- `.harness/manifest.yaml` — dogfood installed harness manifest.
- `modules/*/module.yaml` — active module definitions.
- `open-questions.yaml` — structured unresolved questions.
- `decisions/0001-adopt-decisions-and-open-questions-domain.md` — first
  dogfood decision record, created with the new decisions command.
- `scripts/harness.mjs` / `scripts/init.mjs` / `scripts/decisions.mjs` /
  `scripts/questions.mjs` / `scripts/doctor.mjs` — minimal CLI, installer,
  decision/question commands, and doctor command.
- `scripts/test.mjs` — executable tests for init, doctor, decisions, questions,
  and doctor fixtures.
- `fixtures/doctor/` — negative-path doctor fixtures.
- `spec/agnostic-harness-shape.md` — exploratory catalog of harness process
  domains and supporting capabilities.
- `spec/portability-model.md` — exploratory portability model and install
  sketch.

## Next Work

- Keep hardening the existing init/doctor/decisions/questions loop until the
  next improvement becomes speculative.
- Decide whether the next narrow breadth increment should be a module/profile
  installer, an upgrade-plan command, or a richer installed manifest lock.
- Add the next process domain only when it forces one concrete tooling
  improvement and can be dogfooded immediately.

## Open Questions

- See `open-questions.yaml`.
