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

Continue with this strategy until it outlives its usefulness.

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

## Current loop

The first loop is:

- Process domains: `agent-operating-contract`, `progressive-orientation`.
- Tooling: `.harness/manifest.yaml`, module definitions, `harness doctor`.
- Next tooling: `harness init --profile minimal` for the two existing modules.

## Operating rules

- Do not add a process domain only as prose unless it is immediately useful to
  this repo or the next installable profile.
- Do not expand CLI surface area unless it validates, installs, migrates, or
  operates an existing process domain.
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

