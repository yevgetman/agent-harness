# Formal Design: V1 Decisions And Open Questions

**Status:** accepted baseline  
**Date:** 2026-05-14  
**Scope:** decision records and unresolved-question tracking  
**Process domain:** Decisions And Open Questions

This is a formal design document. It defines the first implementation of the
Decisions And Open Questions process domain for the portable harness.

## Decision

Add Decisions And Open Questions as the next dogfooded process domain after the
minimal Agent Operating Contract and Progressive Orientation loop.

This domain installs:

- `decisions/`
- `open-questions.yaml`
- `templates/decision.md`

It also adds:

- `harness decisions new "<title>"`
- doctor validation for decision records and open questions

## Rationale

The harness is now making design choices that will affect future modules,
install behavior, and upgrade semantics. Those choices need durable rationale
and unresolved questions need a place that is more structured than `status.md`.

This domain is the right next increment because it creates immediate pressure on
tooling:

- The CLI needs a creation command.
- `doctor` needs structured validation beyond install health.
- The dogfood repo gets a durable decision log before design surface area grows.

## Decision record shape

Decision records live under:

```text
decisions/
```

Filename:

```text
NNNN-slug.md
```

Required frontmatter:

```yaml
---
id: 1
title: Example Decision
status: proposed
date: 2026-05-14
supersedes: []
superseded_by: null
---
```

Allowed statuses:

- `proposed`
- `accepted`
- `superseded`
- `reversed`

Required sections:

- `## Context`
- `## Decision`
- `## Consequences`

Optional sections may be added when useful, but the required sections keep every
decision readable by agents.

## Open questions shape

Open questions live in:

```text
open-questions.yaml
```

Initial entry shape:

```yaml
- id: example-question
  title: Example question?
  status: open
  owner: maintainer
  trigger: what event or evidence resolves this
  notes: optional
```

Allowed statuses:

- `open`
- `in_progress`
- `resolved`
- `deferred`

## When to create a decision

Create a decision record when a future agent or maintainer would reasonably ask:

> Why did we choose this?

Good triggers:

- Process-domain set changes.
- Module or manifest semantics change.
- CLI command behavior becomes binding.
- Upgrade or safety policy changes.
- A design direction intentionally rejects a plausible alternative.

## When to create an open question

Create an open question when uncertainty:

- Blocks design or implementation.
- Affects future compatibility.
- Needs a trigger or evidence threshold.
- Would otherwise be scattered across `status.md`, design docs, or chat.

## Doctor validation

`harness doctor` should validate:

- `open-questions.yaml` exists and parses when the module is installed.
- Open-question IDs are unique.
- Open-question statuses are allowed.
- Decision files follow `NNNN-slug.md`.
- Decision frontmatter parses.
- Decision IDs match filename numbers.
- Decision IDs are unique.
- Decision statuses are allowed.
- Required sections exist.

This is still lightweight validation. It enforces shape, not quality of
rationale.

## CLI behavior

`harness decisions new "<title>"` should:

1. Find the next decision ID.
2. Slugify the title.
3. Create `decisions/NNNN-slug.md`.
4. Refuse to overwrite an existing file.
5. Populate frontmatter and required sections.

The command creates a draftable skeleton. The invoking agent or human still
fills in the rationale.

