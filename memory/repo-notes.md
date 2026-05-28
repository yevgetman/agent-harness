# Repo Notes

## Durable Notes

- `~/code/harness` is both the harness source repo and the first installed
  dogfood target.
- `~/code/meetingly` is the first named real-repo smoke target and should be
  validated through disposable copied-target smoke, not by source-owned target
  registration.
- Public npm publication is intentionally deferred; distribution remains
  validation machinery for private installed-instance use.

## Promotion Cues

- Move rationale into `decisions/`.
- Move current work into `status.md` and `plans/current.yaml`.
- Move authoritative state into `state/canonical-state.yaml`.
