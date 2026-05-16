# Harness Agent Instructions

Harness metadata:
- package: portable-harness
- version: 0.1.0
- profile: dogfood

This repo is the source repo and first dogfood target for the portable harness.

## Operating Contract

Agents working here should treat the repo as both:

- The place where the portable harness is designed and implemented.
- The first target repo that incrementally adopts the harness process domains.

Do not treat exploratory specs as binding unless a formal design document says
so. Formal design documents live under `design/`.

## Boot Sequence

On every substantive session:

1. Read this file.
2. Read `status.md`.
3. Read `index.yaml`.
4. Read `state/CONTEXT.md`.
5. Read `design/v1-product-spec-and-roadmap.md` when making product, roadmap,
   or sequencing decisions.
6. Read the relevant formal design document under `design/`.
7. Use `spec/` only as supporting source material unless the task explicitly
   asks to revise a spec.

This boot sequence is the first dogfood implementation of the Progressive
Orientation process domain: start with a small map and context briefing, then
drill into deeper docs only when the task requires it.

## Status Discipline

`status.md` is the current project-state projection. It is not a changelog and
should not grow without bound.

After every significant choice, build step, design change, or repo-structure
change:

1. Update `status.md` in the same change.
2. Edit existing bullets in place when that keeps the file clearer.
3. Add new bullets only when they represent current state that future sessions
   need during boot.
4. Remove or compress stale details instead of preserving history inline.

History belongs in git. Current orientation belongs in `status.md`.

## Commit And Push Discipline

After completing a feature, process-domain increment, significant doc update,
or validation/tooling change, commit and push the work unless there is a clear
reason to defer remote publication.

If pushing is deferred, record the reason in `status.md` or the final response
so the next agent understands the handoff state.

## Progressive Orientation Discipline

Keep `AGENTS.md` short. It should route agents to the right context, not absorb
the whole repo.

Keep `index.yaml` current when files are added, removed, or promoted into the
formal reading path.

Keep `state/CONTEXT.md` concise. It should summarize current design posture and
where to go next, not duplicate formal designs or exploratory specs.

## Harness Build Strategy

Product direction lives in `design/v1-product-spec-and-roadmap.md`.

This repo currently uses the build-specific strategy in
`design/v1-incremental-build-strategy.md`.

Short version:

1. Add a narrow unit of breadth.
2. Work depth to the maximum prudent extent.
3. Add the next unit of breadth only after the current unit has executable
   behavior, validation, tests, docs, and dogfood usage.

This strategy is not a harness process domain and should not be exported as
portable harness behavior by default.

The current gate state lives in `build/depth-gate.yaml`. Treat it as
repo-local build methodology, not a portable process-domain artifact.

## Decisions And Open Questions Discipline

Create a decision record when a future agent would reasonably ask why a choice
was made. Use:

```bash
npm run decisions:new -- "<title>"
```

Use `npm run decisions:list` to inspect existing decisions.

Capture unresolved blockers or compatibility questions in `open-questions.yaml`
rather than letting them accumulate in `status.md`.

Use `npm run questions:list` to inspect unresolved questions.

## Upgrade Planning Discipline

Use `npm run upgrade:plan` to inspect installed harness state before changing
upgrade-related behavior. The command is read-only; it does not apply changes.
Use `node scripts/harness.mjs upgrade --plan --json` when stable
machine-readable plan output matters.

`npm run upgrade:apply` exists only as a safe scaffold. It may apply no-op and
lock-refresh-safe operations plus deterministic command repairs, and must
refuse blocked or review-required plans.

## Lock And Provenance Discipline

`.harness/lock.yaml` records installed-file fingerprints for harness-managed
artifacts. Treat lock diffs as lifecycle changes, not incidental churn.

Use `npm run lock:check` to inspect whether the installed lock matches current
managed-file state.

When intentionally changing locked dogfood files, refresh the lock before final
validation and push:

```bash
npm run lock:refresh
```

## Module Installation Discipline

Use `npm run modules:list` to inspect available and installed process-domain
modules.

Use `node scripts/harness.mjs modules add <module-id> --target <path>` to
install an available module into another harness target. The first module add
surface is collision-averse and does not merge human-authored files.

Use `npm run profiles:list` to inspect available install profiles before
changing profile-backed init behavior.

## Structured Metadata Discipline

Keep `metadata/artifacts.yaml` current when adding durable formal docs,
modules, CLI entrypoints, or other artifacts future agents should be able to
list and validate.

Use `npm run metadata:check` to validate the artifact registry.
Use `npm run metadata:report` or filtered `node scripts/harness.mjs metadata
list --tag <tag>` when orienting through structured artifact metadata.

## Invariants And Golden Principles Discipline

Keep `invariants/golden-principles.yaml` current when a repo rule becomes
important enough that future agents should preserve or copy it.

Use `npm run invariants:check` to validate checked invariants after changing
operating-contract, status, build-strategy, or lifecycle-discipline artifacts.

## Plans And Status Discipline

Keep `plans/current.yaml` current when active, blocked, planned, or deferred
work changes.

Use `npm run plans:check` after changing `status.md`, current plans, or
plan-referenced artifacts.

## Distribution Readiness Discipline

Use `npm run distribution:check` after changing package contents or package
metadata.

Use `npm run distribution:smoke` after changing package contents, CLI entry
points, profile installation, or distribution/version-source behavior.

## Current Design Vocabulary

- **Harness process domain** is the canonical term for a conceptual operating
  concern supported by the harness.
- **Process domain** is acceptable shorthand when the harness context is clear.
- **Capability** is concrete behavior satisfying a process domain.
- **Module** is an installable implementation that provides capabilities.
- **Profile** is a selected module bundle for a target repo type.
