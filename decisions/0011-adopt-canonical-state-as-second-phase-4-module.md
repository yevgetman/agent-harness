---
id: 11
title: "Adopt canonical state as second phase 4 module"
status: accepted
date: 2026-05-15
supersedes: []
superseded_by: null
---

# Adopt canonical state as second phase 4 module

## Context

Structured Metadata is installed, dogfooded, and deepened with filters, JSON
output, report summaries, and dependency-reference validation. The depth gate
marks that pass complete and ready for the next Phase 4 breadth unit.

The v1 roadmap lists Canonical State as a likely Phase 4 candidate. This repo
already has multiple durable artifacts with different authority roles:
formal designs, status projections, orientation registries, installed
lifecycle state, locks, module definitions, and metadata. Agents need an
explicit way to tell source-of-truth artifacts from projections and operational
state.

## Decision

Adopt `canonical-state` as the second Phase 4 process-domain module.

The module installs `state/canonical-state.yaml`, exposes
`harness state check`, validates canonical-state roles and dependency
references, and makes `harness doctor` validate canonical state when the module
is installed.

## Consequences

- Phase 4 continues with installable, validated process-domain breadth.
- The dogfood repo now carries an explicit authority model alongside
  `metadata/artifacts.yaml`.
- Future reconciliation, gardening, and generated-report work can inspect
  source/projection/registry/lifecycle roles instead of inferring them from
  filenames.
- Freshness checks, projection/source comparison, automatic discovery, and
  merge behavior for existing target files remain deferred depth work.
