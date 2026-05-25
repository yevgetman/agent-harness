# Formal Design: V1 Installed Harness Manifest

**Status:** accepted baseline  
**Date:** 2026-05-14  
**Scope:** target-repo harness installation state  
**Depends on:** `design/v1-process-domain-design.md`

This is a formal design document. It defines how a target repository records
that the portable harness is installed, which profile and modules are active,
which files are harness-managed, and how future commands such as
`harness doctor` and `harness upgrade` reason about installed state.

## Decision

The installed harness manifest lives at:

```text
.harness/manifest.yaml
```

The `.harness/` namespace is reserved for local harness installation metadata,
upgrade state, reports, and lock files. It keeps harness-owned state out of the
repo root while leaving root-level user-facing files such as `AGENTS.md`,
`index.yaml`, and `status.md` visible.

## Why not root `harness.yaml`

A root manifest is more discoverable but creates unnecessary root clutter and
does not leave a natural namespace for future harness-local files.

The boot path still exposes the harness clearly:

- `AGENTS.md` tells agents the repo is harnessed.
- `index.yaml` provides orientation.
- `.harness/manifest.yaml` records installed machinery.
- `.harness/lock.yaml` records installed-file provenance.

## Manifest responsibilities

The installed manifest records:

- Manifest schema version.
- Installed harness version.
- Active profile.
- Harness source channel.
- Installed modules and module versions.
- Process domains each module provides.
- Harness-managed files.
- File-management mode for each managed file.
- Validation commands that should be available.
- Upgrade policy.

It should answer:

> What harness behavior is installed in this repo, what owns it, and how should
> tooling safely validate or upgrade it?

## Initial manifest shape

```yaml
harness:
  manifest_version: 1
  installed_at: 2026-05-14
  harness_version: 0.1.0
  profile: full
  source:
    type: local
    path: ~/code/harness
    channel: dev
    install_model: installed-instance
  modules:
    - id: agent-operating-contract
      version: 0.1.0
      status: active
      process_domains:
        - agent-operating-contract
    - id: progressive-orientation
      version: 0.1.0
      status: active
      process_domains:
        - progressive-orientation
  managed_files:
    - path: AGENTS.md
      owner: agent-operating-contract
      mode: merge
    - path: status.md
      owner: agent-operating-contract
      mode: merge
    - path: index.yaml
      owner: progressive-orientation
      mode: merge
    - path: state/CONTEXT.md
      owner: progressive-orientation
      mode: merge
  commands:
    destroy: harness destroy
    doctor: npm run doctor
    upgrade-plan: npm run upgrade:plan
  upgrade:
    policy: plan-first
    model: installed-instance
```

## File management modes

Managed files need explicit write semantics so upgrades do not overwrite local
work blindly.

Initial modes:

- `create` — harness owns initial creation; later upgrades only warn on drift.
- `merge` — harness may propose targeted patches, preserving local content.
- `replace` — harness may replace the file if local hash matches expected
  prior state.
- `observe` — harness validates or reads the file but does not write it.

V1 should default to `merge` for human-facing docs and `replace` only for
generated or lock-like artifacts.

## Upgrade behavior

`harness upgrade` should be plan-first internally. Bare `harness upgrade`
replans and runs the supported safe apply path; `harness upgrade --plan`
remains the explicit read-only form.

It should:

1. Read `.harness/manifest.yaml`.
2. Load installed module definitions.
3. Compare installed module versions to available module versions.
4. Check managed files for local edits.
5. Produce an upgrade plan.
6. Apply only safe deterministic migrations.
7. Leave conflicts as explicit agent/human tasks.

It must not blindly overwrite target files.

`harness init` is merge-safe. If planned human-facing artifacts already exist,
init preserves existing content and adds or updates harness-owned sections.
Structured files are merged only where a safe structured merge exists; otherwise
init refuses instead of overwriting. `--force` remains accepted for compatibility
with older commands, but it does not authorize overwriting human-authored
content. Harness-owned lifecycle files such as `.harness/manifest.yaml` and
`.harness/lock.yaml` may be refreshed by init.

`harness destroy` is the inverse lifecycle operation for an installed target.
Bare `harness destroy` is read-only and prints the teardown plan; `harness
destroy --confirm` permanently removes installed harness artifacts while
preserving `.git/`. It reads the installed manifest and lock, removes
`.harness/`, installed module definitions, module artifacts, and harness-managed
files. Human-facing files with harness-owned marker sections, such as
`AGENTS.md`, `status.md`, `state/CONTEXT.md`, and `.gitignore`, are surgically
edited to remove only those sections when local content remains; generated-only
files are deleted. Files without a safe section boundary are treated as harness
artifacts and deleted on confirmed teardown.

The current implementation exposes only:

```text
harness upgrade --plan
harness upgrade --plan --json
harness upgrade
harness upgrade apply
harness destroy
harness destroy --confirm
```

The plan command reads installed state and reports a plan. The JSON form is the
machine-readable contract. The dogfood source repo uses a local-checkout
version source; package-installed targets may query npm registry metadata for
the configured dist tag as defined by Distribution Readiness.

The apply command is intentionally narrow. It does not rewrite human-facing
managed files.

The plan reports:

- Version source.
- Installed-instance upgrade guidance.
- Installed and available harness versions.
- Installed module state.
- Lock state.
- Managed-file state.
- Command wiring state.
- Plan schema and operation contract versions.
- Typed operation records.
- Operation summary counts.
- Actions, warnings, blockers, and notes.

## Upgrade version source

The manifest `source` block describes how the installed repo should interpret
the harness tool it is running. It is repo-local metadata; it is not a
registration with the source repo.

Initial source fields:

- `type` — `local` for source-checkout dogfood, `package` for package-installed
  targets.
- `channel` — operator-selected lifecycle channel such as `dev`; it does not
  imply central coordination.
- `install_model` — `installed-instance` for the standalone per-repo model.
- `package` — package name for package-installed targets.
- `registry_tag` — npm dist tag to inspect for package-installed targets when
  registry discovery is available.
- `path` — local source path for source-checkout full-profile targets.

For the dogfood source repo, upgrade planning uses a local version source:

- Available harness version comes from this package's `package.json`.
- Available module versions come from local `modules/<id>/module.yaml` files in
  the target repo.
- Source metadata is reported as `local-checkout`.

This gives the source repo a deterministic local baseline. Package-installed
targets use package version-source reporting and npm registry discovery when
available; Homebrew, standalone binary, and remote module-index discovery
remain later design work.

When distribution is chosen, the planner should add a version source record to
the plan output instead of hiding how available versions were resolved.

Upgrade plans also include an `upgrade_guidance` block that summarizes the
installed-instance model, the repo-local tracking boundary, the current
source/channel, and the next operator action. This guidance exists because a
target repo should be able to answer "what harness instance am I running and
what should I do next?" without the source repo knowing that the target exists.

## Doctor behavior

`harness doctor` is the first validation command.

Initial checks:

- `.harness/manifest.yaml` exists and parses.
- `index.yaml` exists and parses.
- Installed module IDs have local module definitions.
- Module definitions agree with manifest module IDs.
- Module-managed files are represented in the manifest.
- Managed files exist.
- Managed files have valid management modes.
- `.harness/lock.yaml` is validated when present.
- Locked file fingerprints match current files or produce drift warnings.
- Manifest command records may expose `harness lock refresh` and
  `harness lock check` for installed-file provenance maintenance.
- Manifest command records may expose `harness upgrade apply`; the apply
  surface permits safe/noop, safe/refresh-lock, deterministic
  safe/repair-command operations, and clean profile-bounded
  safe/install-module operations, plus clean source-template managed-file
  updates.
- Manifest command records may expose `harness profiles sync` for read-only
  active-profile alignment planning.
- Manifest commands are wired when the target repo exposes local package
  scripts or node entrypoints.
- `index.yaml` document entries point to real files.
- `index.yaml` reading order references known document IDs.
- `index.yaml` dependencies reference known document IDs.
- Boot files named by `index.yaml` exist.
- Diagnostics are grouped as successes, warnings, failures, and remediation
  hints.
- Repo-local `build/depth-gate.yaml` is validated when present, but it is not a
  portable installed-harness requirement.

This is intentionally narrower than a full linter. It validates harness
installation health, not all repo content.

## Dogfood install

This repo is the first target repo. It should include:

- `.harness/manifest.yaml`
- `.harness/lock.yaml`
- `modules/agent-operating-contract/module.yaml`
- `modules/progressive-orientation/module.yaml`
- `scripts/harness.mjs`
- `scripts/doctor.mjs`
- `package.json` with `npm run doctor`

The installed manifest and doctor command are the first concrete implementation
of the Harness Lifecycle and Mechanical Validation process domains.
