# Reports And Retrieval

This directory records cross-domain report definitions and durable report
snapshots for the harness source repo dogfood target.

Use `reports/catalog.yaml` to define reports that compose local harness state.
Use `reports/snapshots.md` for durable human-readable output or notes.

Run:

```bash
npm run reports:list
npm run reports:check
npm run reports:report
npm run reports:generate
```
