---
id: 3
title: "Adopt product spec and roadmap as directional v1 north star"
status: accepted
date: 2026-05-14
supersedes: []
superseded_by: null
---

# Adopt product spec and roadmap as directional v1 north star

## Context

The harness has enough implemented surface area that local atomic increments
need a product-level north star. The repo already has formal subsystem designs,
a depth gate, module definitions, and dogfood tooling, but no single formal
document that captures product intent, v1 success criteria, roadmap phases, and
the earlier session vision.

A rigid canonical build plan would be premature. The harness is still being
discovered through dogfooding, and strict task sequencing could force stale or
overfit architecture.

## Decision

Adopt `design/v1-product-spec-and-roadmap.md` as a formal directional product
document.

It sits above subsystem design documents and below `AGENTS.md` in the dogfood
hierarchy. It guides sequencing and tradeoffs, but it does not supersede
depth-gated incremental development or become a canonical sprint plan.

## Consequences

- Agents should consult the product spec when choosing or evaluating major
  breadth increments.
- The product spec should preserve the broad vision: portable, agnostic,
  manifest/module-driven, partly mechanical and partly agent-mediated, useful
  for docs, code, mixed repos, personal scope, business scope, and other durable
  agent-operable workspaces.
- `build/depth-gate.yaml` remains the local mechanism for deciding whether the
  current increment is deep enough to move on.
- The roadmap can be revised as dogfooding invalidates assumptions.
- Product direction is now explicit without freezing implementation into a
  brittle canonical build plan.
