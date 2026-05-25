# Portable Harness

Portable Harness is a CLI and repository scaffold for making software projects
more legible and safer for AI coding agents to work in over time. It organizes
agent-facing repository operations into **process domains**: durable areas of
concern such as orientation, current state, decision memory, structured
metadata, invariants, plans, validation, and lifecycle management.

It installs a small operating layer into a target repository: agent
instructions, current-state documents, structured metadata, decision records,
open questions, invariants, plans, validation commands, and lifecycle state for
safe upgrades. The goal is not to replace project-specific docs or tooling. The
goal is to give agents a consistent way to orient, record durable decisions,
validate repo state, and avoid rediscovering the same context on every session.

This repository is both the source code for the harness and the first dogfood
target. It uses its own process domains while the CLI is being developed.

## Why This Exists

AI agents are useful in real repositories, but they often start each session
from a weak position:

- They have to rediscover the project shape from scratch.
- They confuse current state with stale history.
- They lose track of why earlier decisions were made.
- They scatter plans, blockers, and assumptions across chat transcripts.
- They edit files without a clear model of which files are human-authored,
  generated, managed, or safe to update.
- They lack a repo-local way to validate whether their operating context is
  healthy before making changes.

Portable Harness addresses those problems by installing durable, versioned,
repo-local operating artifacts. A harnessed repo can tell a future agent:

- where to start reading,
- what the current state is,
- what decisions and open questions matter,
- which files are canonical state versus projections,
- which rules should be preserved,
- what work is active or blocked,
- which harness-managed files have drifted,
- and which lifecycle upgrades are safe, review-required, or blocked.

## What It Installs

The default `full` profile installs the current complete baseline:

- `AGENTS.md`: operating contract and boot sequence for agents.
- `status.md`: concise current-state projection, not a changelog.
- `index.yaml`: orientation manifest and reading order.
- `state/CONTEXT.md`: short context briefing for fresh sessions.
- `.harness/manifest.yaml`: installed harness profile, modules, commands, and
  source metadata.
- `.harness/lock.yaml`: fingerprints and provenance for harness-managed files.
- `.gitignore`: a merge-safe harness section for local/transient harness state.
- `decisions/`: durable decision records.
- `open-questions.yaml`: unresolved questions and blockers.
- `templates/decision.md`: decision record template.
- `metadata/artifacts.yaml`: structured artifact registry.
- `state/canonical-state.yaml`: registry of canonical, projection, and derived
  state.
- `invariants/golden-principles.yaml`: rules future agents should preserve.
- `plans/current.yaml`: structured active, planned, blocked, deferred, and
  completed work.
- `modules/*/module.yaml`: local records for installed harness process-domain
  modules.

The `minimal` profile installs only the bootstrap operating contract and
orientation files. Use it when a repo should get the smallest useful harness
surface first.

## Utility

After installation, a target repo gets a practical operating model for agentic
work:

- **Orientation:** future agents start from a known boot path instead of
  crawling the repo blindly.
- **State discipline:** `status.md` and `plans/current.yaml` separate current
  state from history.
- **Decision memory:** important choices and unresolved questions become
  durable files that can be listed and validated.
- **Structured retrieval:** metadata and canonical-state registries make
  important artifacts discoverable without ad hoc search.
- **Validation:** `harness doctor` and module-specific checks catch broken
  harness state early.
- **Upgrade safety:** lock provenance lets `harness upgrade --plan` distinguish
  safe changes from review-required or blocked changes.
- **Git hygiene:** init creates a git repo when needed and only ignores
  transient local harness state, while durable harness artifacts remain
  intended for version control.

## Installation

The current distribution path is a local npm tarball. The package is not
published to npm yet.

Requirements:

- Node.js 20 or newer.
- Git available on `PATH`.

From this source repo:

```bash
npm install
npm run distribution:check
npm run distribution:global-smoke
mkdir -p /tmp/harness-pack
npm pack --pack-destination /tmp/harness-pack
npm install -g /tmp/harness-pack/portable-harness-0.1.0.tgz
```

Verify:

```bash
harness
```

See [docs/install.md](docs/install.md) for the full install, smoke-test, and
upgrade flow.

## Using It In A Target Repo

Install the full harness into the current directory:

```bash
cd /path/to/target-repo
harness init
harness doctor
harness upgrade --plan
```

If the target directory is not already a git repo, `harness init` runs
`git init`. If it already has a git repo, init works inside the existing repo.

Install only the bootstrap profile:

```bash
harness init --profile minimal
```

Preview without writing:

```bash
harness init --dry-run
```

The init process is merge-safe. Existing human-authored content in files such
as `AGENTS.md`, `status.md`, `index.yaml`, `state/CONTEXT.md`, and `.gitignore`
is preserved where the harness has a merge strategy. If a structured file
cannot be merged safely, init refuses instead of overwriting it.

## Common Commands

Health and lifecycle:

```bash
harness doctor
harness lock check
harness lock refresh
harness upgrade --plan
harness upgrade
```

Profiles and modules:

```bash
harness modules list
harness modules add <module-id>
harness profiles list
harness profiles inspect full
harness profiles switch full --plan
harness profiles sync --plan
```

Decision and question tracking:

```bash
harness decisions new "Adopt explicit API boundary"
harness decisions list
harness questions list
```

Structured repo state:

```bash
harness metadata list
harness metadata check
harness state list
harness state check
harness invariants check
harness plans list
harness plans check
```

## Git And Tracked State

Portable Harness treats the installed operating layer as part of the repository.
Commit the durable harness artifacts so future agents and collaborators see the
same operating context.

Tracked by default:

- `.harness/manifest.yaml`
- `.harness/lock.yaml`
- `AGENTS.md`
- `status.md`
- `index.yaml`
- `state/`
- `metadata/`
- `invariants/`
- `plans/`
- `decisions/`
- `modules/`

Ignored by the harness `.gitignore` section:

- `.harness/tmp/`
- `.harness/cache/`
- `.harness/reports/`
- `.harness/*.local.yaml`
- `.harness/*.local.yml`
- `.harness/*.local.json`

## Development

Run the validation suite:

```bash
npm test
npm run doctor
npm run metadata:check
npm run lock:check
npm run distribution:check
npm run distribution:smoke
```

Pack a local tarball:

```bash
mkdir -p /tmp/harness-pack
npm pack --pack-destination /tmp/harness-pack
```

Install the packed CLI globally:

```bash
npm install -g /tmp/harness-pack/portable-harness-0.1.0.tgz
```

## Project Status

Portable Harness is early and actively evolving. The current v1 baseline is
complete for local tarball distribution, and the active direction is v1.1:
installed-instance behavior, safe profile/module upgrades, more process-domain
breadth, and stronger real-repo dogfooding.

Public npm publication is intentionally deferred until release blockers are
cleared, including package visibility and license decisions. Until then, use
the local tarball flow.

Current design and validation references:

- [design/v1.1-installed-instance-roadmap.md](design/v1.1-installed-instance-roadmap.md)
- [design/v1-product-spec-and-roadmap.md](design/v1-product-spec-and-roadmap.md)
- [docs/v1-validation.md](docs/v1-validation.md)
- [docs/install.md](docs/install.md)

## Repository Layout

- `scripts/`: CLI command implementations.
- `modules/`: installable harness process-domain module definitions and
  templates.
- `profiles/`: profile bundles, currently `minimal` and `full`.
- `design/`: formal design documents.
- `docs/`: install and validation documentation.
- `.harness/`: dogfood installed harness manifest and lock.
- `metadata/`, `state/`, `invariants/`, `plans/`, `decisions/`: dogfood
  harness process-domain artifacts.

## License

This project is not licensed for public reuse yet. A release license decision
is required before public package publication or open-source release.
