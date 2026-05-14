# Harness Agent Instructions

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
5. Read the relevant formal design document under `design/`.
6. Use `spec/` only as supporting source material unless the task explicitly
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

## Progressive Orientation Discipline

Keep `AGENTS.md` short. It should route agents to the right context, not absorb
the whole repo.

Keep `index.yaml` current when files are added, removed, or promoted into the
formal reading path.

Keep `state/CONTEXT.md` concise. It should summarize current design posture and
where to go next, not duplicate formal designs or exploratory specs.

## Decisions And Open Questions Discipline

Create a decision record when a future agent would reasonably ask why a choice
was made. Use:

```bash
npm run decisions:new -- "<title>"
```

Capture unresolved blockers or compatibility questions in `open-questions.yaml`
rather than letting them accumulate in `status.md`.

## Current Design Vocabulary

- **Harness process domain** is the canonical term for a conceptual operating
  concern supported by the harness.
- **Process domain** is acceptable shorthand when the harness context is clear.
- **Capability** is concrete behavior satisfying a process domain.
- **Module** is an installable implementation that provides capabilities.
- **Profile** is a selected module bundle for a target repo type.
