# Formal Design: V1 Distribution Readiness

**Status:** accepted baseline
**Date:** 2026-05-16
**Scope:** Phase 5 packed-package smoke validation and package boundary

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

This does not publish a release. It proves that the package boundary contains
the CLI, modules, profiles, templates, validators, and runtime dependencies
needed by target repos.

## Command

```bash
harness distribution check
harness distribution smoke
```

Local package script:

```bash
npm run distribution:check
npm run distribution:smoke
```

`harness distribution check` runs `npm pack --dry-run --json` and validates the
package contents. It fails when required runtime files are missing or when
repo-local dogfood/build artifacts leak into the package.

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

Default profiles:

- `minimal`
- `dogfood`

Supported options:

```bash
harness distribution smoke --profile minimal
harness distribution smoke --profile dogfood
harness distribution smoke --json
harness distribution smoke --keep
```

`--keep` preserves the temporary directory for debugging. Without it, the
temporary directory is removed after the run.

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
```

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
- Install and minimal-profile docs under `docs/`.
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

## Doctor And Test Relationship

The distribution commands are not a replacement for `npm test`. They are
integration checks across the npm package boundary.

`npm test` should cover package contents validation and at least a minimal
packed-package smoke path. Local validation before publishing or handoff should
run the full check and smoke commands.

## Current Limits

- The package remains private and unpublished.
- No Homebrew, standalone binary, or Bun distribution exists.
- Version discovery still reads from the package currently executing, not from
  an external registry.
- The smoke target is temporary and local, not a real external repository.

These limits are acceptable for the first Phase 5 increment because the key
risk is whether the harness works when not run from `~/code/harness`.
