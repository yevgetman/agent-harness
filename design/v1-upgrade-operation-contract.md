# Formal Design: V1 Upgrade Operation Contract

**Status:** accepted baseline  
**Date:** 2026-05-14; amended 2026-05-17
**Scope:** upgrade-plan schema, operation classes, apply safety, and narrow
repair behavior

This is a formal design document. It defines the contract between upgrade
planning and upgrade application for v1 harness lifecycle work.

## Purpose

`harness upgrade --plan` is the safe inspection surface. It turns installed
harness state into a stable list of operations.

`harness upgrade apply` is the mutation surface. It may only execute operation
classes that this contract explicitly marks apply-enabled.

The contract exists so future process-domain modules can add install and
upgrade behavior without relying on ad hoc terminal text, implicit safety
assumptions, or broad file rewrites.

## Plan Shape

Upgrade plans expose:

- `plan_schema_version`: version of the machine-readable plan shape.
- `operation_contract_version`: version of the operation safety contract.
- installed and available harness versions.
- installed profile and source metadata.
- `upgrade_guidance`, the installed-instance source/channel summary and next
  operator action.
- lock state.
- module state.
- managed-file state.
- command state.
- `operation_summary` counts by status and code.
- `operations`, the authoritative ordered operation list.
- human-scan fields: `actions`, `warnings`, `blockers`, and `notes`.

The terminal rendering is not the contract. The JSON plan is.

Use:

```bash
harness upgrade --plan --json
```

`upgrade_guidance` has this initial shape:

- `model`: currently `installed-instance`.
- `tracking`: currently `repo-local`.
- `source_boundary`: reminder that the source repo does not track installed
  target repos.
- `current_instance`: profile, source type, channel, package or local path, and
  a concise source summary.
- `next_operator_action`: the next human/agent action for this repo.
- `operator_workflow`: the private per-repo flow for updating the harness tool,
  running a plan in the target repo, then applying only supported safe
  operations after review.

This block is guidance, not an operation. Mutation authority remains in
`operations`.

## Operation Shape

Each operation has:

- `code`: stable operation code in `<status>/<name>` form.
- `status`: first segment of `code`.
- `subject_type`: kind of target affected by the operation.
- `subject`: target identifier.
- `detail`: human-readable explanation.

Operations may include additional machine-readable fields when required. For
example, `safe/repair-command` includes a `repair` payload.

## Status Classes

`safe`:

- The operation is deterministic and can be performed without overwriting
  ambiguous human-authored content.
- Safe does not mean automatically applied; `harness upgrade apply` must still
  explicitly support the operation code.

`review`:

- The operation may be valid, but the current state needs human or agent review
  before mutation.
- Apply must refuse plans containing any `review/*` operation.

`blocked`:

- The harness cannot safely proceed because required state is missing,
  malformed, or unsupported.
- Apply must refuse plans containing any `blocked/*` operation.

`deferred`:

- The operation is recognized but intentionally not implemented by the current
  apply surface.
- Apply reports deferred operations as skipped.

## Operation Codes

Apply-enabled:

- `safe/noop`: current state already satisfies the operation.
- `safe/refresh-lock`: rebuild `.harness/lock.yaml` from the installed
  manifest and current files.
- `safe/repair-command`: restore a deterministic package script when the
  manifest references an `npm run <script>` command, the script is missing,
  the source package defines the expected script, and local prerequisites such
  as `scripts/harness.mjs` exist.
- `safe/install-module`: install a missing module required by the target's
  active source profile when module-add preflight finds no artifact or command
  collisions.

Review-only:

- `review/harness-version-change`
- `review/module-version-change`
- `review/modified-managed-file`
- `review/unlocked-managed-file`
- `review/unmarked-managed-file`
- `review/missing-lock`
- `review/unchecked-command`
- `review/install-module-collision`

Blocked:

- `blocked/missing-managed-file`
- `blocked/missing-module-definition`
- `blocked/invalid-lock`
- `blocked/unsupported-upgrade-policy`
- `blocked/unrunnable-command`
- `blocked/install-module-unavailable`

Deferred:

- `deferred/installable-module-available`
- `deferred/apply-not-implemented`

## Apply Rules

`harness upgrade apply` must:

- build a fresh plan before mutating.
- refuse the entire apply run when any `blocked/*` operation exists.
- refuse the entire apply run when any `review/*` operation exists.
- refuse unknown safe operation codes until they are explicitly implemented.
- apply only operation codes listed as apply-enabled in this contract.
- report all skipped `deferred/*` operations.
- keep human-facing managed-file rewrites out of scope until a future contract
  defines merge or replacement safety.

## Safe Command Repair

`safe/repair-command` is intentionally narrow.

It can repair package scripts only when all of the following are true:

- the manifest command is `npm test` or `npm run <script>`.
- `package.json` exists and is valid JSON.
- the referenced script is missing.
- the source harness `package.json` defines the same script name.
- any local file prerequisite implied by the source script exists in the target.

The operation writes only `package.json` and only adds the missing script. It
does not overwrite existing script values.

This keeps command repair useful for dogfood/source-style repos without
pretending every installed target has local harness source files.

## Safe Profile Module Install

`safe/install-module` is profile-bounded.

It can install a module only when all of the following are true:

- the module is listed by the target's active source profile;
- the module is available and installable from the source registry;
- the module is absent from the target manifest; and
- the same artifact and command collision checks used by
  `harness modules add` pass without `--force`.

Registry modules that are available but not part of the active profile remain
`deferred/installable-module-available`. This preserves the difference between
"available capability" and "chosen profile behavior".

When an active-profile module install would collide with an existing file or
command, the planner emits `review/install-module-collision` and apply refuses
the whole plan. When required source artifacts or module definitions are
unavailable, the planner emits `blocked/install-module-unavailable`.

Apply reuses the existing module-add installer rather than introducing a
second module installation implementation.

## Semantic Provenance

The lock file now records semantic file metadata in addition to hashes:

- `artifact_role`: installed-manifest, module-definition, managed-file,
  module-artifact, or generated-file.
- `owner_type`: module or harness-lifecycle.
- `module_id`: owning module when applicable.
- `merge_strategy`: manifest-managed file strategy.
- `source_kind`: generated, generated-manifest, module-definition, or
  module-template.
- `source_path` and `source_sha256` when a source artifact is known.

The original `owner`, `mode`, `source`, and `sha256` fields remain part of the
lock shape for compatibility and readability.

## Non-Goals

This contract does not yet define:

- semantic diffs for human-facing documents.
- template merge application.
- module profile switching.
- remote package discovery.
- automatic installation of registry modules that are not in the active
  profile.
- conflict resolution for modified managed files.

Those require additional design and tests before they should become
apply-enabled.
