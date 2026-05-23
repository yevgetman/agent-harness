# Formal Design: V1 Module And Profile Installation

**Status:** accepted baseline  
**Date:** 2026-05-14  
**Scope:** module registry, profile records, module install commands, and
profile-backed init
**Depends on:** `design/v1-product-spec-and-roadmap.md`,
`design/v1-installed-manifest-design.md`

This is a formal design document. It defines the first installable-module
surface for the portable harness.

## Decision

Introduce a local module registry and profile records so process-domain modules
can be listed and installed mechanically instead of hand-wired into a target
repo.

Initial commands:

```text
harness modules list
harness modules add <module-id>
harness profiles list
harness profiles inspect <profile>
harness profiles switch <profile> --plan
harness profiles switch <profile> --apply
```

This is intentionally narrower than a complete package manager. The goal is to
make the next process-domain breadth installable, validatable, and visible to
upgrade planning.

## Registry Shape

The module registry lives at:

```text
modules/registry.yaml
```

Shape:

```yaml
modules:
  - id: decisions-open-questions
    path: modules/decisions-open-questions/module.yaml
    status: active
    installable: true
```

The registry records modules available from the current harness source. It does
not mean every target repo has every module installed.

Modules may be present in the registry but marked `installable: false` when
they are currently installed only by profile initialization. In the first
implementation, `agent-operating-contract` and `progressive-orientation` are
bootstrapped by `harness init --profile minimal`; `decisions-open-questions` is
the first module installable through `harness modules add`.

`structured-metadata` is the next installable module and exercises the same
module/profile lifecycle for Phase 4 process-domain breadth.

## Profile Shape

Profiles live under:

```text
profiles/
```

Initial shape:

```yaml
profile:
  id: minimal
  status: active
  modules:
    - agent-operating-contract
    - progressive-orientation
```

A profile is a named bundle of module IDs. A target repo records its active
profile in `.harness/manifest.yaml`.

`harness init --profile <profile>` reads these profile records. The first
profile-backed init implementation still requires the
`agent-operating-contract` and `progressive-orientation` bootstrap modules so
newly initialized repos always receive an operating contract and progressive
orientation path.

## Module Install Metadata

Module definitions may include install metadata:

```yaml
module:
  id: decisions-open-questions
  managed_files:
    - path: open-questions.yaml
      mode: merge
  commands:
    decisions-new: harness decisions new
  install:
    artifacts:
      - path: decisions/
        type: directory
      - path: open-questions.yaml
        type: template
        source: modules/decisions-open-questions/templates/open-questions.yaml
```

Initial artifact types:

- `directory` — create the directory if missing.
- `template` — copy a source file into the target path.

## Install Behavior

`harness profiles list` should:

1. Read profile records from `profiles/`.
2. Report profile ID, status, and module bundle.
3. Fail when profile records cannot be parsed.

`harness profiles inspect <profile> [--target <path>] [--json]` should:

1. Read the requested source profile from `profiles/`.
2. Resolve each profile module through `modules/registry.yaml`.
3. Report source module metadata, installability, managed files, commands, and
   install artifacts.
4. When a target manifest is available, classify each profile module as
   installed, clean-install, review-required, blocked, or not-inspected.
5. Reuse module-add preflight for missing target modules without writing files.
6. Emit JSON when `--json` is passed.

`harness profiles switch <profile> --plan [--target <path>] [--json]` should:

1. Require an installed target manifest.
2. Read the requested source profile from `profiles/`.
3. Reuse profile inspection and module-add preflight for required modules.
4. Classify already installed modules as safe/present.
5. Classify clean missing profile modules as safe planned installs.
6. Classify artifact or command collisions as review-required.
7. Classify unavailable or non-installable required modules as blocked.
8. Plan the manifest profile update only after required modules are installed
   or cleanly installable.
9. Report modules outside the requested smaller profile as retained by default,
   not removed.
10. Emit JSON when `--json` is passed.

`harness profiles switch <profile> --apply [--target <path>] [--json]` should:

1. Require an installed target manifest.
2. Rebuild the switch plan internally before any mutation.
3. Refuse plans with review-required or blocked operations.
4. Pre-check every required module install before writing any files.
5. Install clean missing requested-profile modules through the module-add
   installer.
6. Update `.harness/manifest.yaml` `harness.profile` only after required
   module installs succeed.
7. Refresh lock provenance for the manifest and installed module artifacts.
8. Record modules outside the requested smaller profile as retained/deferred,
   not removed.
9. Emit JSON without nested install logs when `--json` is passed.

`harness init --profile <profile>` should:

1. Read the requested profile from `profiles/`.
2. Resolve the profile module bundle through `modules/registry.yaml`.
3. Refuse profiles missing the required init bootstrap modules.
4. Install the target operating contract, orientation files, manifest, and
   profile module definitions.
5. Install module artifacts for profile modules that declare install metadata.
6. Write profile module commands into the target manifest.
7. Write installed-file provenance into `.harness/lock.yaml`.

When planned harness artifacts already exist, init should warn and refuse to
overwrite them unless `--force` is explicitly passed. Forced init is a
definitive overwrite of the planned harness artifacts in the target repo; it
does not attempt to merge an existing harness process.

## Module Add Behavior

`harness modules add <module-id>` should:

1. Read available modules from the local registry.
2. Read the target `.harness/manifest.yaml`.
3. Refuse unknown or non-installable modules.
4. No-op when the module is already installed.
5. Check target artifact collisions before writing.
6. Copy the module definition into `modules/<module-id>/module.yaml`.
7. Create declared module artifacts.
8. Add the module to the manifest.
9. Add module-managed files to manifest `managed_files`.
10. Add module commands to manifest `commands`.
11. Refresh `.harness/lock.yaml` for the manifest, module definition, and
    non-directory module artifacts.

Initial conflict behavior:

- Existing files block install unless `--force` is explicitly passed.
- Existing directories may be reused.
- Existing manifest entries should not be duplicated.
- No upgrade or merge behavior is applied by `modules add`.

## Doctor Behavior

`harness doctor` should validate registry/profile shape when those files are
present.

Initial checks:

- Registry parses.
- Registry module IDs are unique.
- Registry module paths exist.
- Registry entries point to matching module definitions.
- Installed modules appear in the registry when the registry exists.
- Profiles parse.
- Profile IDs are unique.
- Profile module IDs exist in the registry.

## Upgrade Plan Behavior

`harness upgrade --plan` should report modules available from the registry but
not installed in the target repo.

This makes the planner aware of installable-but-absent process domains without
making any changes.

## Current Limits

- `modules add` does not update `index.yaml` yet.
- `modules add` does not merge human-authored files.
- Profile inspection is read-only; it does not apply missing modules.
- Profile switch planning is read-only; profile switch apply handles only clean
  plans and refuses review-required or blocked operations.
- Profile removal is not implemented.
- Module removal is not implemented.
- Module dependency solving is not implemented.
- External registry discovery is deferred.

These limits are acceptable for the first installable-module surface. The goal
is to create the controlled path future process domains will use.
