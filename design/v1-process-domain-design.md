# Formal Design: V1 Harness Process Domains

**Status:** accepted baseline  
**Date:** 2026-05-14  
**Scope:** portable, general-purpose harness infrastructure  
**Distinguishes from:** exploratory specs under `spec/`

This is a formal design document. It locks the first coherent design baseline
for the portable harness. The exploratory files in `spec/` remain source
material and design notes; this document is the current target architecture for
v1 unless superseded by a later formal design.

## Goal

Build a portable, general-purpose harness infrastructure that can be dropped
into any repository: documents, code, mixed repos, personal state, business
state, research corpora, project workspaces, or other agent-operable systems.

The harness should align agents working in the target repo to a coherent
workflow. In this context, **workflow** means the combination and interaction of
all installed harness process domains.

Installation should be partly mechanical and partly agent-mediated:

- Mechanical installation creates deterministic files, scripts, metadata, and
  task wiring.
- Agent-mediated installation interprets the target repo and authors domain-
  specific artifacts where judgment is required.

The harness should be extensible. Process domains, capabilities, modules, and
profiles must be updatable over time, and improvements should be able to cascade
through installed repos via a future command such as:

```bash
harness upgrade
```

The eventual product shape is a CLI tool distributed as a binary or package.
Distribution mechanism is intentionally deferred.

## Terminology

- **Harness process domain** — conceptual operating concern the harness supports.
  Casual shorthand: **process domain**.
- **Capability** — concrete behavior satisfying a process domain.
- **Module** — installable implementation that provides one or more
  capabilities.
- **Profile** — selected module bundle for a target repo type.
- **Workflow** — the combined behavior created by all installed process domains
  in a target repo.
- **Harness source repo** — this repo; owns the portable harness design,
  modules, templates, scripts, and upgrade logic.
- **Target repo** — any repo into which the harness is installed.

## Core Design Split

There are two systems:

1. **Target workflow** — the process domains agents follow inside an installed
   repo.
2. **Harness infrastructure** — the CLI, module, profile, versioning, template,
   validation, and upgrade system that installs and maintains those process
   domains.

These should remain distinct. `Harness Lifecycle` is the bridge between them.

## V1 Process Domain Set

V1 should define **15 formal harness process domains**.

The broader agnostic shape catalog remains useful as a capability inventory, but
the top-level v1 set must be smaller, named, installable, upgradable, and easy
to explain to agents.

### 1. Agent Operating Contract

Defines how agents behave in the repo: boot sequence, authority boundaries,
commit rules, human escalation, repo-specific identity, and status-maintenance
obligations.

Maps from the shape catalog:

- Boot map
- Human judgment boundary
- Safety rails

### 2. Progressive Orientation

Controls how agents learn the repo without context overload.

Maps from the shape catalog:

- Progressive disclosure
- Manifest and dependency graph
- Context briefing
- Reading order

### 3. Canonical State

Defines where truth lives and how source-of-truth artifacts are distinguished
from projections, mirrors, scratchpads, generated reports, and temporary notes.

Maps from the shape catalog:

- System of record
- Source / freshness discipline
- Archives and supersession

### 4. Structured Metadata

Makes docs, code artifacts, and harness-managed files machine-legible.

Maps from the shape catalog:

- Structured frontmatter
- Manifest entries
- Dependency graph
- Tags
- Status
- Versions

### 5. Invariants And Golden Principles

Defines architectural and process rules that must hold, plus canonical patterns
agents should copy when extending the repo.

Maps from the shape catalog:

- Structural invariants
- Golden principles
- Mechanical enforcement targets

### 6. Durable Memory

Preserves cross-session context.

Maps from the shape catalog:

- Memory layer
- Preferences
- Decisions digest
- Session log
- Operator context

### 7. Capture And Triage

Gives informal or not-yet-structured material somewhere safe to land, then
defines promotion paths when material becomes authoritative.

Maps from the shape catalog:

- Scratchpad
- Review and feedback capture
- Promotion paths

### 8. Decisions And Open Questions

Stores rationale and unresolved uncertainty in durable, structured forms.

Maps from the shape catalog:

- Decision records
- ADRs
- Open questions register

### 9. Plans And Status

Tracks work in motion.

Maps from the shape catalog:

- Plans as first-class artifacts
- Status projections
- Blockers
- Next actions
- Phase states

### 10. Application / Corpus Legibility

Makes the repo's subject matter inspectable by agents.

For code/application repos, this includes logs, tests, local boot commands,
screenshots, metrics, traces, fixtures, and health checks.

For document/corpus repos, this includes index files, chunks, status summaries,
source maps, generated reports, and freshness checks.

Maps from the shape catalog:

- Application legibility
- Agent-first optimization

### 11. Mechanical Validation

Provides deterministic checks.

Maps from the shape catalog:

- Lint
- Schema validation
- Tests
- Dependency freshness checks
- `harness doctor`

### 12. Reconciliation And Drift Detection

Finds semantic mismatch between prose, structured state, status, decisions, and
reality.

Maps from the shape catalog:

- Reconciliation loop
- Semantic pass
- Stale-doc reports

### 13. Gardening And Entropy Management

Continuously removes rot.

Maps from the shape catalog:

- Document gardening
- Garbage collection
- Quality ledger
- Archive pass
- Duplicate consolidation

### 14. Reports And Retrieval

Produces machine-readable and human-readable views.

Maps from the shape catalog:

- Generated reports
- RAG / chunking
- Audit logs
- Changelogs
- External mirrors

### 15. Harness Lifecycle

Installs, upgrades, migrates, and extends the harness itself.

Maps from the shape catalog:

- Profiles
- Modules
- Installer
- Upgrades
- Versioning
- Migrations
- Extension registry

## Portable Harness Architecture

### Core CLI

The eventual harness should expose a distributable CLI.

Candidate commands:

```bash
harness init
harness apply --profile personal
harness doctor
harness lint
harness reconcile
harness garden
harness status
harness upgrade
harness modules list
harness modules add decisions
```

### Target Harness Manifest

Each installed target repo should have a local manifest describing the installed
harness version, profile, modules, and source channel.

Possible shape:

```yaml
harness:
  version: 0.1.0
  profile: personal
  modules:
    - agent-contract
    - orientation
    - canonical-state
    - metadata
    - memory
    - decisions
    - status
  source:
    channel: stable
    package: "@harness/core"
```

The manifest is the target repo's local record of what harness infrastructure is
installed.

### Profiles

Profiles are preset bundles. They should be editable after install.

Candidate profiles:

- `minimal`
- `personal`
- `codebase`
- `docs`
- `mixed`
- `business`
- `research`

### Modules

Modules are installable implementation units. A module may implement one or
more process domains.

Example shape:

```yaml
module:
  id: decisions
  version: 0.1.0
  process_domains:
    - decisions-and-open-questions
  creates:
    - decisions/
    - harness/templates/decision.md
  commands:
    - harness decisions new
  validates:
    - ADR frontmatter
    - duplicate decision IDs
```

### Templates

Templates are rendered into target repos.

Examples:

- `AGENTS.md`
- `index.yaml`
- `state/CONTEXT.md`
- `state/memory/session-log.md`
- `open-questions.yaml`
- ADR template

### Validators

Reusable checks the CLI can run.

Examples:

- Missing boot file
- Broken manifest entry
- Stale generated context
- Unknown process domain
- Missing status source
- Invalid frontmatter
- Unsafe local edits before upgrade

### Upgrades

`harness upgrade` should compare installed harness state to latest module
definitions.

It needs to handle:

- New files
- Changed templates
- Schema migrations
- Renamed modules
- Deprecated process domains
- Local modifications
- Agent-readable upgrade reports

Upgrade must not blindly overwrite target files. It should produce a plan, apply
safe migrations, and mark conflicts for agent or human resolution.

### Agent Instructions

The harness must install instructions agents actually follow.

Likely shape:

```text
AGENTS.md
harness/
  instructions/
    boot.md
    safety.md
    status.md
    decisions.md
```

`AGENTS.md` should stay short and point into deeper instructions.

### Task Runners

The CLI should expose workflow tasks.

Examples:

```bash
harness task boot-check
harness task pre-commit
harness task status-sync
harness task reconcile
harness task garden
```

Target repos can wire these into npm, Bun, Make, git hooks, CI, or standalone
CLI calls.

### Extension System

Longer-term examples:

```bash
harness modules add github-pr-review
harness modules add frontend-observability
harness modules add personal-crm
```

Extensions should declare:

- Process domains affected
- Files installed
- Commands added
- Validators added
- Upgrade hooks
- Agent instruction fragments

## Activation Guidance

Formal v1 has 15 process domains, but install profiles should not activate all
15 equally.

A minimal install may activate only six. A full codebase or business/doc harness
may activate all 15. The 37-item agnostic shape document remains supporting
vocabulary and capability inventory under this formal process-domain set.

## Dogfooding Requirement

This harness repo is the first target repo.

Every process domain and module built for the portable harness should be
implemented in this repo as soon as it is practical. The repo should serve as:

- The source of the harness design.
- The first installed harness target.
- The test corpus for validators and migrations.
- The proving ground for upgrade behavior.

The `me` repo is deferred until the harness is more mature.

## Initial Dogfood Step

Before the CLI exists, the repo begins dogfooding manually:

- Root `AGENTS.md` defines the agent operating contract.
- Root `status.md` tracks current state.
- Agents must check and update `status.md` after significant choices, build
  steps, or design changes.
- `status.md` is not a changelog. It should be edited in place to stay concise
  and current.

