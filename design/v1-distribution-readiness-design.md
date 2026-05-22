# Formal Design: V1 Distribution Readiness

**Status:** accepted baseline
**Date:** 2026-05-16
**Scope:** Phase 5 packed-package smoke validation, package boundary, release
preflight, registry version discovery, external-target smoke, guarded npm
publish workflow, forceable smoke init, and named real-repo smoke

This is a formal design document. It defines the first Distribution Readiness
increments after the Phase 4 Plans And Status breadth pass.

## Purpose

Distribution Readiness makes the harness usable outside the source checkout.

The first v1 implementation is intentionally narrow: build a local npm package
tarball with `npm pack`, install that tarball into temporary target repos, run
the packaged `harness` binary, initialize profiles, run `harness doctor`, and
confirm `harness upgrade --plan --json` reports a package-based version source.

The second increment makes the npm package boundary explicit and mechanically
checked. The package should be a runtime distribution, not a source-repo
snapshot.

The third increment adds a release preflight plan. This does not publish a
release; it proves the release metadata and dry-run publish shape, then keeps
registry publication blocked while the package is private.

The fourth increment adds registry version discovery for package-installed
targets. This lets upgrade planning report the registry state without making an
unpublished or private package a blocker.

The fifth increment adds caller-supplied external-target smoke. This validates
the packed package against a copied target repo shape before registry
publication exists.

The sixth increment adds a guarded npm publish workflow. It defines public npm
registry access as the first publish policy, exposes publish planning, and
refuses publish confirmation while release blockers remain.

The seventh increment validates a named real repo, `~/code/meetingly`, using
the packed package. That smoke found that real targets may already have
bootstrap files, so external smoke now supports `--force` to pass forced init
inside the disposable copied target.

## Command

```bash
harness distribution check
harness distribution release --plan
harness distribution publish --plan
harness distribution publish --confirm
harness distribution smoke
```

Local package script:

```bash
npm run distribution:check
npm run distribution:release-plan
npm run distribution:publish-plan
npm run distribution:smoke
```

`harness distribution check` runs `npm pack --dry-run --json` and validates the
package contents. It fails when required runtime files are missing or when
repo-local dogfood/build artifacts leak into the package.

`harness distribution release --plan` runs the package contents check and
`npm publish --dry-run --json`. It reports release readiness separately from
command success:

- `ok` means the preflight command could inspect package and publish metadata.
- `ready` means no release blockers remain.
- While `package.json` has `private: true`, the plan is expected to be blocked.

The release plan must block when npm dry-run publish auto-corrects package
metadata, because that means the repository's package metadata is not the same
as what npm would publish.

`harness distribution publish --plan` runs the release preflight and reports
whether publish confirmation would be allowed. `harness distribution publish
--confirm` runs the same release preflight first and refuses to publish unless
the plan is ready. The first npm registry access policy is `public`; scoped
package names should publish with `--access public`, while the current unscoped
package uses npm's public default.

`harness distribution smoke`:

1. Creates a temporary work directory.
2. Runs `npm pack <source-root>` into that directory.
3. Validates the packed package contents.
4. Creates temporary git target repos.
5. Installs the packed tarball into each target repo with npm.
6. Runs the installed `node_modules/.bin/harness` binary.
7. Initializes the requested profile or profiles.
8. Runs `harness doctor`.
9. Runs `harness upgrade --plan --json`.
10. Fails if the plan has warnings or blockers.
11. Fails if the plan does not report `version_source.type: package`.
12. Fails if the plan does not report `upgrade_guidance.model:
    installed-instance`.

Default profiles:

- `minimal`
- `dogfood`

Supported options:

```bash
harness distribution smoke --profile minimal
harness distribution smoke --profile dogfood
harness distribution smoke --target ../some-target --profile minimal
harness distribution smoke --target ../some-target --profile minimal --force
harness distribution smoke --json
harness distribution smoke --keep
```

`--keep` preserves the temporary directory for debugging. Without it, the
temporary directory is removed after the run.

When `--target <path>` is provided, the smoke command:

1. Requires the source target path to exist and contain `.git`.
2. Copies the target into the temporary smoke workspace, excluding `.git` and
   `node_modules`.
3. Initializes a new git repo in the copied target.
4. Installs the packed tarball and runs the same init, doctor, and upgrade plan
   checks in the copy.
5. Leaves the original target path unchanged.

If an external target is supplied without `--profile`, the command defaults to
the `minimal` profile. Repeated `--target` and `--profile` options produce one
copied smoke target for each target/profile pair.

`--force` passes `--force` to the packaged `harness init` command inside the
temporary smoke target. This is useful for real repo shapes that already have
bootstrap files such as `AGENTS.md`. The original target is still copied first
and is not mutated. Without `--force`, external smoke remains collision-averse
and reports init refusal as a compatibility gap.

## Upgrade Version Source

When a target manifest records:

```yaml
source:
  type: package
```

`harness upgrade --plan` should report:

```yaml
version_source:
  type: package
  package: portable-harness
  registry_tag: latest
  registry:
    type: npm
    status: unpublished-or-private
    version: null
```

For package-installed targets, the planner queries npm for the configured dist
tag, currently `latest`, and records the result under `version_source.registry`.
Supported registry statuses are:

- `available`: npm returned a version; that version becomes
  `available_harness_version`.
- `unpublished-or-private`: npm reported not found or permission denied; the
  planner falls back to the executing package version.
- `unavailable`: npm lookup failed, timed out, or returned an unexpected shape;
  the planner falls back to the executing package version.
- `skipped`: `HARNESS_REGISTRY_DISCOVERY=skip` disabled lookup for deterministic
  test or smoke paths; the planner falls back to the executing package version.

Registry discovery outcomes are informational. They do not add warnings or
blockers by themselves. A discovered registry version that differs from the
installed manifest version still creates the normal review-required harness
version-change operation.

When the dogfood repo records:

```yaml
source:
  type: local
```

`harness upgrade --plan` should continue to report:

```yaml
version_source:
  type: local-checkout
```

This keeps the plan honest about where the available version and module
definitions were read from.

## Package Boundary

The package manifest uses an explicit `files` list. The current runtime package
includes:

- CLI scripts required by `scripts/harness.mjs`.
- Module definitions and module templates under `modules/`.
- Profile definitions under `profiles/`.
- Install, minimal-profile, and v1 validation docs under `docs/`.
- This Distribution Readiness design.

The package excludes dogfood and source-repo-local artifacts:

- `.harness/`
- `AGENTS.md`
- `build/`
- `decisions/`
- `fixtures/`
- `index.yaml`
- `invariants/`
- `metadata/`
- `open-questions.yaml`
- `plans/`
- `spec/`
- `state/`
- `status.md`
- top-level `templates/`
- `scripts/test.mjs`

The package remains private and unpublished until a later release decision
chooses the package name, registry access policy, and publish workflow.

## Release Preflight

The release preflight is deliberately plan-only. It does not call `npm publish`
without `--dry-run`.

Current blockers:

- `package.json private` is true.
- `package.json license` is `UNLICENSED`.

Current release preflight evidence:

- package contents validation passes.
- `npm publish --dry-run --json` emits publish metadata.
- npm publish dry-run does not auto-correct package metadata.
- `harness distribution publish --plan` reports the same blockers without
  publishing.
- Named real-repo smoke passes against `~/code/meetingly` for the `minimal` and
  `dogfood` profiles using `--force` in the copied target.

## Doctor And Test Relationship

The distribution commands are not a replacement for `npm test`. They are
integration checks across the npm package boundary.

`npm test` should cover package contents validation, release preflight, at
least a minimal packed-package smoke path, and external-target smoke. Local
validation before publishing or handoff should run the full check,
release-plan, and smoke commands.

## Current Limits

- The package remains private and unpublished.
- Release preflight is blocked by design while `private: true`.
- Publish confirmation is blocked while release preflight has blockers.
- No Homebrew, standalone binary, or Bun distribution exists.
- Registry discovery is npm-only, and unpublished/private or unavailable
  registry state still falls back to the package currently executing.
- External-target smoke copies a target repo into a temporary workspace; it does
  not mutate the original target and does not prove registry install.

These limits are acceptable for the current Phase 5 depth because the key risk
is whether the harness works when not run from `~/code/harness`.
