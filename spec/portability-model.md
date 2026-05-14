# Harness Portability Model

This spec defines the high-level model for making the agnostic harness portable
across repositories. The harness should not be a fixed repo template. It should
be an installable manifest, agent playbook, and reusable tooling layer that can
be applied to a target repo.

## Core idea

Portable Harness = specification + installer + agent playbook + reusable
mechanical tools.

The harness should be able to point at any repo, inspect its purpose, then
establish a local workflow that makes the repo agent-legible, mechanically
checked, and maintainable over time.

## 1. Harness source repo

The harness source repo owns the generic harness system.

Example path:

```text
~/code/harness
```

It should contain:

- Feature and architecture specs
- Template files
- Schemas
- Installer instructions
- Agent playbooks
- Reusable scripts
- Default folder layouts
- Optional modules
- Example target repos

It should not contain personal facts, business facts, or target-specific
operating state.

## 2. Target repo

The target repo is the repo being harnessed.

Example path:

```text
~/code/me
```

The portable harness is applied to the target repo by an agent, installer, or
both. The target receives local artifacts such as:

- `AGENTS.md`
- `index.yaml`
- `state/CONTEXT.md`
- `state/memory/*`
- `state/status.md`
- `state/scratchpad.md`
- `harness/scripts/*`
- `harness/schemas/*`
- `decisions/`
- `open-questions.yaml`
- Domain-specific docs

The exact artifact set depends on the selected profile and modules.

## 3. Harness manifest

The harness source repo should include a machine-readable manifest describing
what can be installed.

The agnostic shape catalog names the conceptual layer **harness process
domains**. In casual usage, **process domain** is acceptable when the harness
context is already clear. Modules and profiles should be described in relation
to those process domains:

- **Process domain** — conceptual operating concern, such as entropy
  management or progressive disclosure.
- **Capability** — concrete behavior that satisfies a process domain.
- **Module** — installable implementation that provides one or more
  capabilities.
- **Profile** — selected module bundle for a target repo type.

Example shape:

```yaml
harness:
  version: 0.1.0
  modules:
    - boot-map
    - manifest
    - frontmatter
    - memory
    - decisions
    - open-questions
    - status
    - lint
    - reconcile
    - scratchpad
```

Each module should declare:

- Files to create
- Templates to render
- Scripts to copy
- Questions to ask the user
- Required target repo facts
- Safety constraints
- Validation checks
- Agent instructions

The manifest should make installation predictable while still allowing the
agent to apply judgment where the target domain requires it.

## 4. Agent skill / playbook

The harness must be usable by any capable coding agent, including Claude Code,
Codex, Sovereign AI Harness, or similar tools.

The source repo therefore needs a human-readable and LLM-readable install
playbook.

Example flow:

```text
1. Inspect target repo.
2. Identify domain type: codebase, personal corpus, business corpus, project workspace.
3. Select profile and modules.
4. Create minimum boot path.
5. Add manifest and frontmatter conventions.
6. Add memory and status layer.
7. Add schemas and linter.
8. Run validation.
9. Produce install report.
```

This playbook can later become an actual Codex / Claude skill.

## 5. Mechanical installer

Eventually, the harness source repo should expose a command like:

```bash
harness apply --target ~/code/me --profile personal
```

The installer should not replace agent judgment. It should handle deterministic
work:

- Copy templates
- Render variables
- Create directories
- Install schemas
- Install scripts
- Initialize manifest stubs
- Run validation

The agent handles target interpretation:

- What the repo is for
- Which profile fits
- What domain docs should exist
- Which facts belong in the first context briefing
- Which questions should remain open

## 6. Development progression

Build portability in phases:

1. Docs-only install playbook
2. Templates plus copy script
3. Configurable installer
4. Agent skill
5. Self-updating harness module system

This avoids prematurely freezing a structure before the first target repo has
tested the assumptions.

## 7. Profiles

The harness should support profiles instead of one rigid generated structure.

Candidate profiles:

- `minimal`
- `personal`
- `codebase`
- `business`
- `research`
- `project`
- `client`

Each profile selects modules and default docs.

For `~/code/me`, the profile would be `personal`.

## 8. Proposed harness repo structure

The harness source repo can evolve toward this shape:

```text
harness/
├── README.md
├── AGENTS.md
├── agnostic-harness-shape.md
├── spec/
│   ├── portability-model.md
│   ├── module-system.md
│   └── profiles.md
├── modules/
│   ├── boot-map/
│   ├── manifest/
│   ├── frontmatter/
│   ├── memory/
│   ├── decisions/
│   ├── open-questions/
│   ├── status/
│   ├── scratchpad/
│   ├── lint/
│   ├── reconcile/
│   └── chunking/
├── profiles/
│   ├── minimal.yaml
│   ├── personal.yaml
│   ├── codebase.yaml
│   └── business.yaml
├── templates/
│   ├── AGENTS.md
│   ├── index.yaml
│   ├── state/
│   └── schemas/
├── scripts/
│   └── apply-harness.mjs
└── examples/
    └── personal/
```

This is directional, not locked. The first target installation should shape the
final layout.

## 9. First target: `~/code/me`

The `me` repo should become the first real target repo for testing the portable
harness.

Current state:

```text
me/
└── personal-details.md
```

A harnessed personal-state repo might become:

```text
me/
├── AGENTS.md
├── index.yaml
├── profile/
│   └── personal-details.md
├── interests/
├── projects/
├── efforts/
├── decisions/
├── state/
│   ├── CONTEXT.md
│   ├── status.md
│   ├── scratchpad.md
│   └── memory/
│       ├── preferences.md
│       ├── decisions-made.md
│       └── session-log.md
├── open-questions.yaml
└── harness/
    ├── schemas/
    └── scripts/
```

Do not mutate `~/code/me` into this shape until the portable harness spec says
how to apply it.

## 10. Key principle

The harness source repo answers:

> Given an arbitrary repo, how does an agent turn it into an agent-legible,
> self-maintaining operating environment?

The target repo answers:

> What does that harness look like when applied to this specific domain?

For the first target:

- `~/code/harness` defines the portable system.
- `~/code/me` validates the personal-scope profile.
