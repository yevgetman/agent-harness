# Gardening And Entropy Management

This directory records cleanup rules and durable gardening snapshots for the
harness source repo dogfood target.

Use `gardening/rules.yaml` to define local cleanup checks. Use
`gardening/snapshots.md` for durable human-readable plan output or notes.

Run:

```bash
npm run garden:list
npm run garden:check
npm run garden:report
npm run garden:plan
```
