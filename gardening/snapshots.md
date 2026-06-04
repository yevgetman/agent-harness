# Gardening Snapshots

Durable gardening plan snapshots can be copied here when cleanup findings
should remain available across sessions.

## 2026-06-04 Threshold And Policy Dogfood

The first dogfood `harness garden plan` run surfaced open capture pressure and
completed-plan volume. The capture item was promoted into triage and active
plans. Completed-plan pressure was handled by moving cleanup thresholds into
`gardening/rules.yaml`, keeping `harness garden plan` read-only, and labeling
reviewed cleanup actions without applying archive, trim, delete, or rewrite
behavior.
