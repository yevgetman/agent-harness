# Reconciliation And Drift Detection

This directory records local drift rules and durable reconciliation snapshots
for an installed harness target.

Use `reconciliation/rules.yaml` for structured drift rules. Use
`reconciliation/snapshots.md` for copied plan output or notes that should
remain local to this repo.

Run:

```bash
harness reconcile list
harness reconcile check
harness reconcile report
harness reconcile plan
```
