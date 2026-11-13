# Superseded goal documents

`e2e-build-goal.md` is **the** goal (adopted 2026-08-11). These two predate it
and are kept only so a claim in an old commit message or PR can be traced.

Do not work from them. Where they disagree with `e2e-build-goal.md` or
`e2e-test-catalogue.md`, they are wrong.

| File | Superseded by |
|---|---|
| `e2e-goal.superseded.md` | `../e2e-build-goal.md` |
| `e2e-goal-v2.superseded.md` | `../e2e-build-goal.md` |

`../e2e-master-test-plan.md` is only *partly* superseded: the catalogue replaces
its §5–§6 scenario lists, but its §2 harness items are still the source for the
`HW1`–`HW10` rows in the ledger.

## PR #1017 QA scratch

Working notes from the QA pass on PR #1017 (`feat(manager): migrate names
directly through HCA`). They sat at the repo root; they are session scratch, not
product docs, and they describe a branch state that no longer exists.

Kept for the same reason as the documents above — so a claim in an old commit
message can be traced — and for the state-space plan's analysis of the V1 token
shapes, which informed the `GW`/`GS` rows in the ledger.

| File | What it is |
|---|---|
| `pr-1017-migration-state-space-plan.md` | The V1 state space derived from ens-app-v3's `getNameType` and ens-contracts' fuse semantics |
| `pr-1017-test-plan-v2.md` | The test plan built from that state space |
| `pr-1017-qa-report-v2.md` | Findings from running it |
| `pr-1017-chrome-qa-prompt-v2.md` | The browser-driving prompt used for the run |

Superseded by `../e2e-test-catalogue.md` and `e2e/coverage/scenarios.ts`, which
carry the same state space in a form the reconciler can measure.
