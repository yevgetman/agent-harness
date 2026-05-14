# Doctor Fixtures

These fixtures support `scripts/test.mjs` negative-path checks for
`harness doctor`.

- `good-open-questions.yaml` is a valid open-question registry fragment.
- `bad-open-questions.yaml` contains an invalid open-question status.
- `good-decision.md` is a valid decision record.
- `bad-decision-id.md` has frontmatter that intentionally disagrees with the
  filename ID used by the test.

The tests install a temporary minimal harness, add the Decisions And Open
Questions module, copy these fixtures into place, and then verify that doctor
reports the expected failures.
