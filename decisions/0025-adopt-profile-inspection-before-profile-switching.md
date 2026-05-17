---
id: 25
title: "Adopt profile inspection before profile switching"
status: accepted
date: 2026-05-17
supersedes: []
superseded_by: null
---

# Adopt profile inspection before profile switching

## Context

Profile-backed init and profile-bounded upgrade apply are implemented, but
profile switching remains a larger mutation surface. A switch command would
need to explain which modules are already installed, which modules can be added
cleanly, and which target artifacts would require review.

The harness already has the needed source inputs: `profiles/*.yaml`,
`modules/registry.yaml`, module definitions, target manifests, and module
install preflight. What is missing is a read-only command that presents this
state directly before any switching or apply behavior mutates a target.

## Decision

Add `harness profiles inspect <profile> [--target <path>] [--json]` before
adding profile switching.

The command inspects a source profile and reports each module's source
metadata, managed files, commands, artifacts, and installability. When a target
manifest is available, it also reports target state:

- `installed` when the target already has the module,
- `clean-install` when the missing module passes module-add preflight,
- `review-required` when an artifact or command collision exists,
- `blocked` when source state or installability prevents installation, and
- `not-inspected` when no target manifest is loaded.

The command is read-only. It reuses the same module install preflight as
`modules add` and `upgrade apply`, but it does not write files.

## Consequences

- Users and future agents can understand a profile's target impact before
  applying missing modules or designing profile switching.
- Profile switching can build on an inspectable plan shape instead of
  introducing mutation and explanation at the same time.
- `profiles inspect` becomes a package script and a generated manifest command.
- Profile removal, module dependency solving, and actual profile switching
  remain deferred.
