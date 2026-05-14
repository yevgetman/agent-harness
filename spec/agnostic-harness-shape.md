# Agnostic Harness Shape

This note captures the general shape of an agent-legible harness, independent
of whether the underlying corpus is a document set, codebase, personal operating
system, business state bundle, or project workspace.

The core idea: a harness is not just a folder of docs or scripts. It is a
versioned, legible, mechanically checked operating environment where agents can
understand state, modify it safely, detect drift, and improve the system that
governs their future work.

## Nomenclature

The items in this catalog are **harness process domains**.

In casual usage, **process domain** is acceptable when the harness context is
already clear. The full term stays canonical because it distinguishes these
domains from content domains like `personal`, `business`, `research`, or
`codebase`.

A harness process domain is a recurring operating concern the harness must
support, such as progressive disclosure, entropy management, doc-gardening,
structural invariants, or application legibility.

Related terms:

- **Harness process domain** — conceptual operating concern.
- **Capability** — concrete behavior that satisfies a process domain.
- **Module** — installable implementation that provides one or more
  capabilities.
- **Profile** — selected module bundle for a target repo type.

Example: `Entropy Management` is a harness process domain; stale-doc detection
and archive passes are capabilities; a `garden` module might implement them;
the `personal` profile may choose to install that module later rather than on
day one.

## Process-Domain Vocabulary

The harness process vocabulary should cover both document-state harnesses and
code/application harnesses. These concepts map onto the detailed domains below.

| Process domain | Represented by |
|---|---|
| Application legibility | Runtime / Application Legibility; Agent-Legible Tooling; Generated Reports |
| Progressive disclosure | Progressive Documents; Boot Map; Manifest And Dependency Graph |
| Structural invariants | Golden Rules / Invariants; Mechanical Enforcement |
| Agent-first optimization | Agent-First Optimization; System Of Record; Progressive Documents |
| Golden principles | Golden Rules / Invariants; Mechanical Enforcement; Review And Feedback Capture |
| Doc-gardening | Document Gardeners; Reconciliation Loop; Semantic Pass |
| Entropy management | Garbage Collection; Operating Cadence; Quality Ledger |

## 1. Boot Map

Short entrypoint that tells an agent who it is, what to read first, what not to
do, and where deeper truth lives.

Examples: `AGENTS.md`, `CLAUDE.md`, `README.md` with explicit agent section.

Principle: the boot map is a table of contents, not the encyclopedia.

## 2. Progressive Documents

Layered documentation where the agent starts small and drills down only when
needed.

Typical layers:

- Condensed context briefing
- Manifest / index
- Domain docs
- Plans
- Decision records
- Reference material
- Archives

Goal: progressive disclosure instead of a single giant instruction blob.

## 3. System Of Record

Repository-local, versioned knowledge that future agents can actually inspect.

If important state lives only in chat, memory, Slack, Notion, email, or a
person's head, it effectively does not exist to the harness.

## 4. Manifest And Dependency Graph

Machine-readable index of documents, versions, reading order, summaries, and
dependencies.

Functions:

- Gives agents a map.
- Lets tooling detect stale references.
- Makes document relationships explicit.
- Supports retrieval and boot ordering.

## 5. Structured Frontmatter

Per-document metadata that turns prose into inspectable state.

Common fields:

- `title`
- `doc_id`
- `version`
- `status`
- `supersedes`
- `depends_on`
- `updated`
- `tags`
- `entities_referenced`

## 6. Golden Rules / Invariants

Small set of load-bearing principles that must remain true across the harness.

These are not casual preferences. They are architectural constraints, operating
rules, or taste rules that prevent drift.

Good invariant test: if this rule is violated, does the harness become less
safe, less legible, or less maintainable for future agents?

Two subtypes matter:

- **Structural invariants** are architectural rules that must hold across the
  repository or application, such as dependency direction, state ownership, or
  allowed write boundaries.
- **Golden principles** are canonical patterns for repeated constructs, such as
  naming conventions, logging shape, status-section format, frontmatter shape,
  or component structure.

Both should become mechanical checks where practical. Review culture is not a
reliable enforcement layer once agents are generating most changes.

## 7. Mechanical Enforcement

Linters, schema checks, structural tests, CI, and hooks that enforce the harness
rules automatically.

Principle: if a rule can be checked mechanically, it should not live only in
prose.

## 8. Decision Records

ADR-style records for decisions future agents or humans will need to understand.

Decision-record trigger: future-me or future-agent would reasonably ask, "Why is
this true?"

## 9. Canonical Fact Registry

Structured facts referenced by prose.

Depending on the harness domain, this might hold:

- People
- Projects
- Dates
- Commitments
- Constraints
- Preferences
- Goals
- Resources
- Products
- Clients
- Systems

Prose can cite registry entries so drift is detectable.

## 10. Open Questions Register

Structured list of unresolved questions, owners, triggers, blockers, and
resolution criteria.

Purpose: prevent uncertainty from being scattered across prose.

## 11. Glossary / Vocabulary Layer

Canonical definitions for load-bearing terms.

Especially useful when terms carry private, personal, business, aesthetic, or
strategic meaning that common usage does not capture.

## 12. Status Projection

Current-state summary derived from canonical docs, not itself the source of
truth.

Answers:

- What is active?
- What is blocked?
- What is next?
- What changed recently?
- What is stale?

## 13. Memory Layer

Durable cross-session state.

Typical files:

- Preferences
- Decisions in effect
- Session log
- User or operator context
- Collaboration boundaries

Memory is distinct from formal source docs. It captures continuity, not the full
canonical corpus.

## 14. Scratchpad

Informal capture space for half-formed thoughts, fragments, ideas, and "park
this" material.

Scratchpad content is explicitly non-authoritative until promoted into a formal
artifact.

## 15. Reconciliation Loop

Completeness scanner that asks whether new prose introduced structured state
that should be captured elsewhere.

Common questions:

- Did this add a new fact?
- Did this imply a decision?
- Did this surface an open question?
- Did this change current status?
- Did this introduce a term that belongs in the glossary?

## 16. Mechanical Cascade

Automatic deterministic cleanup after edits.

Examples:

- Update `updated` dates.
- Refresh manifest entries.
- Repair dependency pins.
- Normalize metadata.
- Register newly tracked documents.

No judgment required.

## 17. Semantic Pass

Judgment-based cleanup that mechanical tools cannot safely do.

Examples:

- Detect embedded decisions.
- Infer new open questions.
- Suggest fact registry updates.
- Identify stale status.
- Propose glossary additions.
- Detect duplicated concepts.

This can begin as advisory and graduate toward auto-application with safety
rails.

## 18. Document Gardeners

Recurring agent jobs that scan the corpus for rot.

They look for:

- Stale claims
- Obsolete docs
- Duplicated concepts
- Broken assumptions
- Missing links
- Weak structure
- Unpromoted scratchpad items
- Docs that no longer reflect reality

## 19. Garbage Collection

Regular cleanup of accumulated entropy.

Examples:

- Archive completed plans.
- Merge duplicates.
- Prune stale status.
- Consolidate scratchpad items.
- Retire dead references.
- Update quality grades.
- Remove outdated generated artifacts.

Principle: small continuous cleanup is cheaper than periodic large cleanup.

## 20. Eval / Orientation Tests

Checks that verify a fresh agent can orient correctly from the boot path.

Typical form:

- A set of questions with expected answers.
- A rubric.
- A pass threshold.
- Re-run trigger after substantive context or memory changes.

Purpose: test whether the harness is actually legible.

## 21. RAG / Chunking Layer

Deterministic section-level export of the corpus for retrieval, embeddings, or
search.

Even before embeddings, chunk output is useful as a diagnostic for corpus shape.

## 22. Generated Reports

Machine-produced reports that feed agent judgment.

Examples:

- Reconcile report
- Status-sync report
- Stale-doc report
- Quality report
- Audit report
- Dependency drift report

Reports are inputs to action, not usually canonical truth.

## 23. Quality Ledger

Place to track known weak areas, debt, confidence levels, and quality grades.

Useful when the harness is too large for a human or agent to keep all weaknesses
in working memory.

## 24. Plans As First-Class Artifacts

Execution plans are committed, versioned, status-tracked, and eventually
completed or archived.

Complex work should not live only in ephemeral chat.

## 25. Review And Feedback Capture

Human feedback, review comments, bug reports, and taste corrections should be
promoted into durable form.

Possible destinations:

- Docs
- Rules
- Tests
- Lints
- Invariants
- Decision records
- Quality ledger

Feedback compounds only when encoded.

## 26. Agent-Legible Tooling

Scripts and commands the agent can run directly.

Examples:

- `lint`
- `test`
- `reconcile`
- `status-sync`
- `chunk`
- `audit`
- `garden`
- `validate`

Avoid hidden manual-only processes.

## 27. Source / Freshness Discipline

Derived artifacts record what they were generated from and when.

Tooling detects when source docs changed after derived status, context, reports,
or summaries were generated.

## 28. Archives And Supersession

Old docs are not silently deleted when they explain history.

Lifecycle states:

- `draft`
- `active`
- `superseded`
- `archived`

Supersession preserves why the current shape exists.

## 29. Human Judgment Boundary

Explicit division between what agents may auto-apply and what requires human
choice.

Examples:

- Mechanical metadata updates: safe to auto-apply.
- Fact registry additions: maybe auto-apply if exact and additive.
- Major decisions: usually require human acceptance.
- Destructive cleanup: require review or tight allowlists.

## 30. Autonomy Ladder

Gradual progression of agent responsibility.

Typical ladder:

- Advisory reports
- Proposed edits
- Auto-applied mechanical fixes
- Auto-applied low-risk semantic fixes
- Background maintenance jobs
- End-to-end task execution with escalation only for judgment

## 31. Safety Rails

Controls that bound agent action.

Examples:

- Allowlisted paths
- No destructive edits
- Protected frontmatter fields
- Max diff size
- Schema validation
- No net-negative semantic passes
- Rollback-friendly commits
- Separate bot identities

## 32. Change Ledger

Durable feed of what changed and why.

Forms:

- Git log
- Changelog
- Session log
- Daily summary
- Semantic-pass log
- Audit log

## 33. External Surface Mirrors

Optional rendered surfaces for humans.

Examples:

- Notion mirror
- Slack digest
- Dashboard
- Email summary
- Website

Rule: mirrors are projections, not the source of truth.

## 34. Domain-Specific Schemas

Schemas that keep structured data valid without over-constraining early
evolution.

Principle: start permissive, then tighten where drift becomes expensive.

## 35. Operating Cadence

Defined rhythms that keep the harness alive.

Examples:

- Boot checks
- Per-edit lint
- Pre-commit cascade
- Daily gardener
- Weekly status review
- Monthly archive pass
- Eval rerun after context changes

Cadence turns maintenance from heroic cleanup into routine hygiene.

## 36. Runtime / Application Legibility

For code or application repos, the running system should be directly observable
and queryable by the agent.

Examples:

- UI snapshots
- Logs
- Metrics
- Traces
- Test fixtures
- Seed data
- Local boot commands
- Health checks
- Repro scripts

Goal: the agent can boot the application in isolation, inspect it visually or
textually, measure behavior, and debug without human intervention.

In a document-state harness, the equivalent is corpus legibility: manifests,
reports, status projections, and chunk outputs that make the current state
observable without rereading every source file.

## 37. Agent-First Optimization

Design the repository for how agents reason, not only for human reading
preferences.

Agent-first optimization favors:

- Stable, composable, predictable structures
- Repository-local knowledge
- Discoverable architectural patterns
- Explicit state ownership
- Small boot path with deeper on-demand docs
- Scripts that expose repo health without hidden manual steps
- Canonical examples that agents can safely copy

This does not mean making the repo worse for humans. It means avoiding designs
that rely on unstated context, oral tradition, invisible dashboards, or review
habits that agents cannot inspect.
