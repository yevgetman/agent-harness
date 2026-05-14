# Minimal Install Profile

The `minimal` profile is the first portable install target for the harness.

It installs only enough structure to align agents around a repo-local operating
contract and progressive orientation path.

## Installed Process Domains

- Agent Operating Contract
- Progressive Orientation

## Installed Files

- `AGENTS.md`
- `status.md`
- `index.yaml`
- `state/CONTEXT.md`
- `.harness/manifest.yaml`
- `modules/agent-operating-contract/module.yaml`
- `modules/progressive-orientation/module.yaml`

## Command

```bash
harness init --profile minimal --target <repo>
```

By default, `harness init` expects the target to be a git repository. Use
`--allow-non-git` only for tests, fixtures, or intentional non-repo targets.

Use `--dry-run` to inspect the install plan without writing files.

Use `--force` only after reviewing local changes. The installer will otherwise
refuse to overwrite existing managed files.

## Current Limits

- The profile does not install Decisions And Open Questions.
- There is no upgrade path yet.
- File management modes are recorded in `.harness/manifest.yaml`, but merge
  behavior is not implemented yet.
- The generated files include harness package, version, and profile metadata,
  but they do not yet include content hashes or provenance records.
