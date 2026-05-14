# Formal Design: V1 Incremental Build Strategy

**Status:** accepted baseline  
**Date:** 2026-05-14  
**Scope:** short-term harness build strategy  
**Supersession:** revisit when this strategy stops producing useful design
pressure

This is a formal design document. It locks the short-term strategy for building
the portable harness: integrate process domains and tooling incrementally, with
each side forcing discipline on the other.

## Decision

Build the harness through **incremental tooling plus process-domain
integration**.

Every new process domain should force one concrete tooling improvement. Every
tooling improvement should serve a process domain already dogfooded in this
repo.

Add breadth, then work depth to the maximum prudent extent before adding more
breadth.

Continue with this strategy until it outlives its usefulness.

## Strategy scope

This strategy is specific to building this harness repo. It is not a harness
process domain, not part of the portable v1 process-domain set, and not a
workflow that installed repos inherit by default.

A target repo may choose to add a similar development strategy on top of an
installed harness. In that case, the harness should respect the target repo's
declared strategy the same way it respects other repo-local operating context,
but the strategy remains outside the core process-domain model.

## Rationale

Two failure modes are likely if we bias too far in either direction:

- **Tooling-first failure:** the project builds an abstract installer before it
  knows what the installer needs to install.
- **Domain-first failure:** the project accumulates process docs without enough
  executable pressure to prove they work.

The harness should instead move in small loops:

1. Define or refine a process domain.
2. Dogfood it in this repo.
3. Add the smallest tooling surface that installs or validates it.
4. Add tests or doctor checks that catch regressions.
5. Update `status.md` and the orientation manifest.

This keeps the design grounded in real target behavior while preserving forward
momentum toward a portable CLI.

A third failure mode is accumulating a broad set of shallow, half-built
domains and commands. The mitigation is a depth gate: after adding a small unit
of breadth, deepen that unit until additional polish would stop producing
practical confidence. Only then add another unit of breadth.

## Current loop

The initial installed surfaces, the read-only upgrade planning surface, and the
first module/profile installation increment are complete enough to choose the
next narrow breadth item.

Completed breadth includes:

- Initial process domains: `agent-operating-contract`,
  `progressive-orientation`, and `decisions-open-questions`.
- Initial tooling: `.harness/manifest.yaml`, module definitions,
  `harness doctor`, `harness init --profile minimal`, `harness decisions`, and
  `harness questions`.
- Harness lifecycle planning: `harness upgrade --plan`.
- Module/profile installation: `harness modules list`, source registry,
  profile records, and `harness modules add decisions-open-questions`.

The repo-local gate at `build/depth-gate.yaml` records completed and current
depth passes and is validated by `harness doctor` when present. Use that file,
not this design document, as the current atomic build-state record.

## Operating rules

- Do not add a process domain only as prose unless it is immediately useful to
  this repo or the next installable profile.
- Do not expand CLI surface area unless it validates, installs, migrates, or
  operates an existing process domain.
- After adding breadth, harden the new surface before adding the next domain or
  command family.
- Depth means executable behavior, validation, tests, docs, and dogfood usage;
  not just more explanatory prose.
- Stop deepening when the next improvement would be speculative or less useful
  than the next narrow unit of breadth.
- Keep module definitions narrow until a command needs more metadata.
- Prefer a small runnable command over a large complete design.
- Prefer a formal design document when a choice will steer future command or
  module behavior.
- Keep `status.md` current after each significant design or tooling change.

## Exit criteria

Revisit this strategy when one of the following becomes true:

- The process-domain set stabilizes enough that implementation can proceed from
  a larger spec without discovery pressure.
- The CLI and module system are mature enough that new domains can be added by
  filling in known interfaces.
- The incremental loop starts causing local inconsistencies or duplicated
  transitional code.
- A target repo install reveals that the dogfood repo is no longer an adequate
  test bed.
