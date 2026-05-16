# Formal Design: V1 Distribution Readiness

**Status:** accepted baseline
**Date:** 2026-05-16
**Scope:** first Phase 5 increment for packed-package smoke validation

This is a formal design document. It defines the first Distribution Readiness
increment after the Phase 4 Plans And Status breadth pass.

## Purpose

Distribution Readiness makes the harness usable outside the source checkout.

The first v1 implementation is intentionally narrow: build a local npm package
tarball with `npm pack`, install that tarball into temporary target repos, run
the packaged `harness` binary, initialize profiles, run `harness doctor`, and
confirm `harness upgrade --plan --json` reports a package-based version source.

This does not publish a release. It proves that the package boundary contains
the CLI, modules, profiles, templates, validators, and runtime dependencies
needed by target repos.

## Command

```bash
harness distribution smoke
```

Local package script:

```bash
npm run distribution:smoke
```

The command:

1. Creates a temporary work directory.
2. Runs `npm pack <source-root>` into that directory.
3. Creates temporary git target repos.
4. Installs the packed tarball into each target repo with npm.
5. Runs the installed `node_modules/.bin/harness` binary.
6. Initializes the requested profile or profiles.
7. Runs `harness doctor`.
8. Runs `harness upgrade --plan --json`.
9. Fails if the plan has warnings or blockers.
10. Fails if the plan does not report `version_source.type: package`.

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

## Doctor And Test Relationship

The smoke command is not a replacement for `npm test`. It is an integration
check across the npm package boundary.

`npm test` should cover at least a minimal packed-package smoke path. Local
validation before publishing or handoff should run the full smoke command.

## Current Limits

- No package is published.
- No Homebrew, standalone binary, or Bun distribution exists.
- Version discovery still reads from the package currently executing, not from
  an external registry.
- The smoke target is temporary and local, not a real external repository.

These limits are acceptable for the first Phase 5 increment because the key
risk is whether the harness works when not run from `~/code/harness`.
