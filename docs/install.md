# Harness Install

The current distribution path is a local npm tarball. The package is not
published to a registry yet.

For the full v1 closeout validation matrix and deferred-scope summary, see
`docs/v1-validation.md`.

## Global CLI From Local Tarball

From the harness source repo:

```bash
npm run distribution:check
npm run distribution:global-smoke
npm run distribution:release-plan
npm run distribution:publish-plan
npm run distribution:smoke
mkdir -p /tmp/harness-pack
npm pack --pack-destination /tmp/harness-pack
```

Install the CLI globally on the machine:

```bash
npm install -g /tmp/harness-pack/portable-harness-0.1.0.tgz
```

From a target repo:

```bash
cd ~/code/sitekit
harness init
harness doctor
harness upgrade --plan
harness upgrade
```

`harness init` defaults to the complete `full` profile. It is equivalent to
`harness init --profile full --target .`. Use `--profile minimal` only for
target repos that should receive the bootstrap harness files without the
additional process-domain modules.

If the target directory is not already a git repository, init creates one with
`git init`. If the target already has a git repository, init runs inside the
existing repo. `--allow-non-git` is retained only as a deprecated escape hatch
for installing without automatic git initialization.

Init is merge-safe. If files such as `AGENTS.md`, `status.md`, `index.yaml`,
or `state/CONTEXT.md` already exist, init preserves their content and adds or
updates harness-owned sections. If a structured file cannot be merged safely,
init refuses instead of overwriting it. `--force` remains accepted for older
commands, but it no longer authorizes overwriting human-authored content.

Init also creates or updates a harness-owned section in `.gitignore`. Durable
harness artifacts are intended to be committed, including `.harness/manifest.yaml`,
`.harness/lock.yaml`, `AGENTS.md`, `status.md`, `index.yaml`, `state/`,
`metadata/`, `invariants/`, `plans/`, `capture/`, `memory/`, `decisions/`,
`legibility/`, `reports/`, `reconciliation/`, `gardening/`, and `modules/`. The
installed `.gitignore` section ignores only local/transient operator state:
`.harness/tmp/`, `.harness/cache/`, `.harness/reports/`, and `.harness/*.local.*`.

To remove the harness from a target repo, inspect the teardown plan first:

```bash
harness destroy
```

Apply the teardown explicitly:

```bash
harness destroy --confirm
```

Destroy preserves `.git/`. It removes installed harness lifecycle state,
module definitions, module artifacts, and managed files. Files with
harness-owned marker sections, such as `AGENTS.md`, `status.md`,
`state/CONTEXT.md`, and `.gitignore`, are edited to remove those sections when
local content remains; generated-only files are deleted.

## Repo-Local Package Install

The older repo-local install path still works when a target repo should carry
the harness as a dev dependency:

```bash
cd ~/code/sitekit
npm init -y
npm install --save-dev /tmp/harness-pack/portable-harness-0.1.0.tgz
./node_modules/.bin/harness init
./node_modules/.bin/harness doctor
./node_modules/.bin/harness upgrade --plan
```

## Installed-Instance Upgrade Flow

Each repo owns its own `.harness/manifest.yaml` and `.harness/lock.yaml`.
Installing the harness does not register that repo with the source repo, and
the source repo does not know where the harness is installed.

Private upgrade flow:

1. Update, build, or install the desired harness tool version.
2. In each target repo that should receive the improvement, run:

```bash
harness upgrade --plan
```

3. Resolve blockers and review-required operations in that target repo.
4. Run apply only for supported safe operations:

```bash
harness upgrade
```

`harness upgrade --plan --json` includes `version_source` and
`upgrade_guidance` so an installed repo can explain its source/channel, package
or local checkout, and next operator action without central coordination.

## Package Boundary

The package intentionally includes the CLI scripts, module definitions, module
templates, profiles, install/minimal/v1-validation docs, and Distribution
Readiness design. Repo-local dogfood state such as `.harness/`, `build/`,
`capture/`, `decisions/`, `gardening/`, `legibility/`, `memory/`,
`metadata/`, `plans/`, `reports/`, `reconciliation/`, `state/`, `status.md`,
and test fixtures is not part of the runtime package.

`npm run distribution:check` validates this boundary with `npm pack --dry-run`.
`npm run distribution:smoke` validates the packed tarball by installing it into
temporary target repos and running the installed `harness` binary.
`npm run distribution:global-smoke` validates machine-level CLI installation
through a temporary npm global prefix.

To validate a real target repo shape without mutating it, pass the target path
to smoke:

```bash
npm run distribution:smoke -- --target ../some-target --profile minimal
```

The smoke command copies the target into a temporary work directory, excludes
`.git` and `node_modules`, installs the packed tarball into the copy, and runs
the harness checks there.

If the copied target already has bootstrap files such as `AGENTS.md`, smoke
validation still preserves them through merge-safe init. The legacy `--force`
flag is accepted for compatibility, but it does not authorize overwrites:

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
