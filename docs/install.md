# Harness Install

The current distribution path is a local npm tarball. The package is not
published to a registry yet.

For the full v1 closeout validation matrix and deferred-scope summary, see
`docs/v1-validation.md`.

## Local Tarball

From the harness source repo:

```bash
npm run distribution:check
npm run distribution:release-plan
npm run distribution:publish-plan
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

## Installed-Instance Upgrade Flow

Each repo owns its own `.harness/manifest.yaml` and `.harness/lock.yaml`.
Installing the harness does not register that repo with the source repo, and
the source repo does not know where the harness is installed.

Private upgrade flow:

1. Update, build, or install the desired harness tool version.
2. In each target repo that should receive the improvement, run:

```bash
./node_modules/.bin/harness upgrade --plan
```

3. Resolve blockers and review-required operations in that target repo.
4. Run apply only for supported safe operations:

```bash
./node_modules/.bin/harness upgrade apply
```

`harness upgrade --plan --json` includes `version_source` and
`upgrade_guidance` so an installed repo can explain its source/channel, package
or local checkout, and next operator action without central coordination.

## Package Boundary

The package intentionally includes the CLI scripts, module definitions, module
templates, profiles, install/minimal/v1-validation docs, and Distribution
Readiness design. Repo-local dogfood state such as `.harness/`, `build/`,
`decisions/`, `metadata/`, `plans/`, `state/`, `status.md`, and test fixtures
is not part of the runtime package.

`npm run distribution:check` validates this boundary with `npm pack --dry-run`.
`npm run distribution:smoke` validates the packed tarball by installing it into
temporary target repos and running the installed `harness` binary.

To validate a real target repo shape without mutating it, pass the target path
to smoke:

```bash
npm run distribution:smoke -- --target ../some-target --profile minimal
```

The smoke command copies the target into a temporary work directory, excludes
`.git` and `node_modules`, installs the packed tarball into the copy, and runs
the harness checks there.

If the copied target already has bootstrap files such as `AGENTS.md`, use
forced init inside the disposable smoke copy:

```bash
npm run distribution:smoke -- --target ../some-target --profile minimal --force
```

The original target repo is still not mutated.

## Registry Install

Registry installation is deferred until release blockers are cleared. The first
npm access policy is public for `portable-harness`; the package remains
unpublished while `private: true` and `UNLICENSED` are present.

Run the release and publish plans before any registry publish attempt:

```bash
npm run distribution:release-plan
npm run distribution:publish-plan
```

The current expected result is blocked because `package.json` has
`private: true` and `license: UNLICENSED`. Treat that as intentional until a
release decision clears those blockers.

Publish confirmation is guarded:

```bash
node scripts/harness.mjs distribution publish --confirm
```

It runs the release preflight first and refuses to publish unless the plan is
ready.

Package-installed upgrade plans query npm registry state for the configured
dist tag. Until the package is published, `harness upgrade --plan` should report
the registry package as unpublished or private and fall back to the installed
package version.
