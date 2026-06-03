# Reconciliation And Drift Detection

This directory records drift rules and durable reconciliation snapshots for the
harness source repo dogfood target.

Use `reconciliation/rules.yaml` to define local drift checks. Use
`reconciliation/snapshots.md` for durable human-readable plan output or notes.

Run:

```bash
npm run reconcile:list
npm run reconcile:check
npm run reconcile:report
npm run reconcile:plan
```
