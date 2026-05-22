# V1 Validation And Deferred Scope

Last updated: 2026-05-17

This document is the v1 closeout matrix for the portable harness. It records
what v1 proves, the commands that validate it, and the work intentionally left
outside v1.

## V1 Status

V1 is validated for local packed npm tarball distribution.

The harness can be installed into target git repos from a packed package, can
initialize `minimal` and `dogfood` profiles, can validate installed state with
doctor, can plan upgrades from installed manifest and lock state, and can add
the current installable process-domain modules.

Public npm registry publication is not part of v1 closeout. The guarded publish
workflow exists, but confirmation remains blocked while `package.json` has
`private: true`, `license: UNLICENSED`, or any release-preflight blocker.

## Validation Matrix

| Area | V1 behavior | Validation |
| --- | --- | --- |
| Agent operating contract | `AGENTS.md` establishes boot, status, lock, plans, metadata, distribution, and vocabulary discipline. | `npm run doctor` validates the file and the installed manifest references. |
| Progressive orientation | `index.yaml` and `state/CONTEXT.md` provide a small boot path before deeper docs. | `npm run doctor` validates index references and boot files. |
| Minimal profile install | `harness init --profile minimal` installs operating contract, status, index, context, manifest, lock, and bootstrap module definitions. | `npm test` covers fresh git-target init, doctor, upgrade plan, dry-run collisions, and force overwrite. |
| Force init contract | Normal init warns/refuses when planned artifacts exist; `--force` definitively overwrites planned harness artifacts. | `npm test` covers warnings, collision reporting, and overwrite of an existing `AGENTS.md`. |
| Module/profile lifecycle | Source profiles are listable, inspectable, and plan-switchable; registry modules can be listed and added into target repos. | `npm test`, `npm run profiles:list`, `npm run profiles:inspect -- dogfood`, `npm run profiles:switch -- dogfood --plan`, and `npm run modules:list`. |
| Additional process domains | Structured Metadata, Canonical State, Invariants And Golden Principles, and Plans And Status are installed and dogfooded. | `npm run metadata:check`, `npm run state:check`, `npm run invariants:check`, `npm run plans:check`, and `npm run doctor`. |
| Lock and provenance | `.harness/lock.yaml` records fingerprints and semantic provenance; lock drift is detectable. | `npm run lock:check`, `npm run doctor`, and lock/upgrade tests in `npm test`. |
| Upgrade planning | Upgrade plan is plan-first, read-only, lock-aware, operation-classified, JSON-capable, and reports installed-instance source/channel guidance plus next operator action. | `npm run upgrade:plan` and `node scripts/harness.mjs upgrade --plan --json`. |
| Safe upgrade apply | Apply permits safe/noop, safe/refresh-lock, deterministic safe/repair-command, and post-v1 profile-bounded safe/install-module operations. | `npm test` covers safe apply, clean profile module install, blocked plans, and review-required refusal. |
| Package boundary | The npm package has an explicit runtime `files` boundary and excludes dogfood/source-local state. | `npm run distribution:check`. |
| Packed-package smoke | The package installs into temporary target repos and validates installed `harness` behavior. | `npm run distribution:smoke`. |
| External target smoke | A caller-supplied git target is copied into the smoke workspace and validated without mutating the source repo. | `npm test` and `node scripts/harness.mjs distribution smoke --target <path> --profile minimal --force`. |
| Named real-repo smoke | `~/code/meetingly` validates as a named target for both `minimal` and `dogfood` profiles. | `node scripts/harness.mjs distribution smoke --target /Users/julie/code/meetingly --profile minimal --force` and the same command with `--profile dogfood`. |
| Release preflight | Release planning runs package validation and `npm publish --dry-run --json` without publishing. | `npm run distribution:release-plan`; expected v1 status is blocked. |
| Guarded publish planning | Publish planning reports readiness without publishing; confirmation refuses blocked plans. | `npm run distribution:publish-plan`; expected v1 status is blocked. |

## Closeout Command Set

Run this set before claiming the v1 baseline is still healthy:

```bash
node --check scripts/init.mjs
node --check scripts/modules.mjs
node --check scripts/profiles.mjs
node --check scripts/distribution.mjs
node --check scripts/upgrade.mjs
node --check scripts/test.mjs
npm test
npm run profiles:list
npm run profiles:inspect -- dogfood
npm run profiles:switch -- dogfood --plan
npm run metadata:check
npm run state:check
npm run invariants:check
npm run plans:check
npm run lock:check
npm run doctor
npm run upgrade:plan
npm run distribution:check
npm run distribution:release-plan
npm run distribution:publish-plan
npm run distribution:smoke
node scripts/harness.mjs distribution smoke --target /Users/julie/code/meetingly --profile minimal --force
node scripts/harness.mjs distribution smoke --target /Users/julie/code/meetingly --profile dogfood --force
git diff --check
```

Expected v1 release/publish state:

- `distribution:release-plan` exits successfully but reports `status: blocked`.
- `distribution:publish-plan` exits successfully but reports `status: blocked`.
- Blockers are intentional until a release-license and publication decision is
  resumed.

## V1 Behavior Boundary

V1 includes:

- Local packed npm tarball distribution.
- Install, minimal-profile, and v1 validation docs in the package.
- `minimal` and `dogfood` profile installation.
- Registry-backed module listing and module add.
- Dogfooded Decisions And Open Questions, Structured Metadata, Canonical State,
  Invariants And Golden Principles, and Plans And Status.
- Lock-aware doctor and upgrade planning.
- Limited safe upgrade apply scaffold.
- Package boundary validation, release preflight, guarded publish planning, and
  external-target smoke.

V1 does not include:

- Public npm registry publication.
- Release license selection.
- Clearing `private: true`.
- Homebrew, Bun, standalone binary, or other distribution channels.
- Full automated file/template upgrade application for human-facing files.
- Profile switch apply commands.
- Full semantic drift detection across arbitrary corpora.
- Deep implementation of every v1 process domain.
- UI, dashboard, or LLM-provider-specific integration.

## Post-V1 Extensions

The first post-v1 upgrade-apply increment is implemented.

`harness upgrade --plan` now emits operation contract version 2. Missing
modules that are required by the target's active profile and pass the same
collision preflight as `harness modules add` are classified as
`safe/install-module`. `harness upgrade apply` installs those modules through
the existing module-add path.

Registry modules that are merely available, but not part of the active
profile, remain `deferred/installable-module-available`. Existing artifact or
command collisions are `review/install-module-collision`, and apply refuses
the whole plan before mutating.

The second post-v1 module/profile lifecycle increment is implemented.

`harness profiles inspect <profile> [--target <path>] [--json]` reports source
profile modules, module metadata, managed files, commands, artifacts, and
installability. When a target manifest is available, it classifies each
profile module as installed, clean-install, review-required, blocked, or
not-inspected without writing files.

The first v1.1 installed-instance upgrade-contract increment is implemented.

Generated target manifests now record `source.install_model:
installed-instance`, package targets record `source.registry_tag`, and upgrade
policy records `upgrade.model: installed-instance`. Upgrade plans emit
`upgrade_guidance` with the repo-local tracking boundary, current source and
channel, next operator action, and private per-repo workflow. The source repo
still does not track installed target repos.

The first v1.1 profile-switching increment is implemented.

`harness profiles switch <profile> --plan [--target <path>] [--json]` builds a
read-only switch plan from the target manifest and source profile. It reuses
module-add preflight, reports clean missing profile modules as safe planned
installs, holds manifest profile updates behind review-required or blocked
module operations, and retains modules outside a smaller requested profile by
default. Apply remains intentionally unimplemented.

## Next Work After V1

Current post-v1 direction lives in
`design/v1.1-installed-instance-roadmap.md`. V1.1 prioritizes standalone
installed-repo upgrade behavior and process-domain depth over public
distribution. The source repo defines the tool; it does not track where the
tool is installed.

The strongest remaining v1.1 candidates are:

1. Add profile switch apply for clean plans.
2. Broaden human-facing file/template upgrade planning while preserving review
   boundaries.
3. Add stronger repo-local cascade upgrade planning and safe apply.
4. Add remaining process-domain baselines.

Public publication remains deferred unless a new decision intentionally resumes
release work.
