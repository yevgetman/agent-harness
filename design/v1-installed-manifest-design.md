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
upgrade state, reports, and future lock files. It keeps harness-owned state out
of the repo root while leaving root-level user-facing files such as `AGENTS.md`,
`index.yaml`, and `status.md` visible.

## Why not root `harness.yaml`

A root manifest is more discoverable but creates unnecessary root clutter and
does not leave a natural namespace for future harness-local files.

The boot path still exposes the harness clearly:

- `AGENTS.md` tells agents the repo is harnessed.
- `index.yaml` provides orientation.
- `.harness/manifest.yaml` records installed machinery.

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
  profile: dogfood
  source:
    type: local
    path: ~/code/harness
    channel: dev
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
    doctor: npm run doctor
  upgrade:
    policy: plan-first
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

`harness upgrade` should be plan-first.

It should:

1. Read `.harness/manifest.yaml`.
2. Load installed module definitions.
3. Compare installed module versions to available module versions.
4. Check managed files for local edits.
5. Produce an upgrade plan.
6. Apply only safe deterministic migrations.
7. Leave conflicts as explicit agent/human tasks.

It must not blindly overwrite target files.

## Doctor behavior

`harness doctor` is the first validation command.

Initial checks:

- `.harness/manifest.yaml` exists and parses.
- `index.yaml` exists and parses.
- Installed module IDs have local module definitions.
- Managed files exist.
- `index.yaml` document entries point to real files.
- `index.yaml` reading order references known document IDs.
- Boot files named by `index.yaml` exist.

This is intentionally narrower than a full linter. It validates harness
installation health, not all repo content.

## Dogfood install

This repo is the first target repo. It should include:

- `.harness/manifest.yaml`
- `modules/agent-operating-contract/module.yaml`
- `modules/progressive-orientation/module.yaml`
- `scripts/harness.mjs`
- `scripts/doctor.mjs`
- `package.json` with `npm run doctor`

The installed manifest and doctor command are the first concrete implementation
of the Harness Lifecycle and Mechanical Validation process domains.

