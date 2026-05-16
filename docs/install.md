# Harness Install

The current distribution path is a local npm tarball. The package is not
published to a registry yet.

## Local Tarball

From the harness source repo:

```bash
npm run distribution:check
npm run distribution:release-plan
npm run distribution:smoke
npm pack --pack-destination /tmp/harness-pack
```

From a target git repo:

```bash
npm init -y
npm install --save-dev /tmp/harness-pack/portable-harness-0.1.0.tgz
./node_modules/.bin/harness init --profile minimal --target .
./node_modules/.bin/harness doctor
./node_modules/.bin/harness upgrade --plan
```

Use `--profile dogfood` only for target repos that should install all current
dogfood process-domain modules.

## Package Boundary

The package intentionally includes the CLI scripts, module definitions, module
templates, profiles, install docs, and Distribution Readiness design. Repo-local
dogfood state such as `.harness/`, `build/`, `decisions/`, `metadata/`,
`plans/`, `state/`, `status.md`, and test fixtures is not part of the runtime
package.

`npm run distribution:check` validates this boundary with `npm pack --dry-run`.
`npm run distribution:smoke` validates the packed tarball by installing it into
temporary target repos and running the installed `harness` binary.

## Registry Install

Registry installation is deferred until the package name, access policy, and
release workflow are decided.

Run the release preflight before any registry publish attempt:

```bash
npm run distribution:release-plan
```

The current expected result is blocked because `package.json` has
`private: true`. Treat that as intentional until a release decision records the
package name, access policy, and publish workflow.

Package-installed upgrade plans query npm registry state for the configured
dist tag. Until the package is published, `harness upgrade --plan` should report
the registry package as unpublished or private and fall back to the installed
package version.
