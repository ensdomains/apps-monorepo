# ENS campaign consolidation

Branch: `test/pr1494-e2e-coverage`. This checkout combines PR #1494 at
`2a5cce392d58c347212cd72985e842a6b455fdf6`, coverage branch commit
`f50aa8d27a3e2c0d52ba6d9fff8a4f93af95b217`, and all campaign source inventoried
below. Historical outcomes retain their original candidate and evidence; they
are not a full-matrix result for this combined branch.

| Campaign | Consolidated source | Completeness check |
| --- | --- | --- |
| ENS replacement execution | `e2e/projects/parity`, `e2e/projects/replacement`, Manager record-preservation specs, manual fixtures and shared test adapters | 497 checks collected; all 260 executed legacy IDs mapped; 0 coverage errors |
| Ownership, roles and record preservation | Before/after parity specs, 17 record-preservation cases, 21 after-migration scenarios and recovery checks | Included in the replacement manifest and collection audit |
| Migration retention matrix | `e2e/projects/migration-matrix`, fixtures, oracles, runners and report programs | All 986 configuration definitions retained; no source path missing from the earlier matrix checkout |
| PR #1494 approval and follow-ups | Approval, grace, cleanup, setter/history, source-race, conflict, permission and unlocked-parent specs | All 36 approval ledger entries retained: 34 point to automated specs; APR-34/35 retain their manual MetaMask evidence |

## Preservation and provenance

- [Source inventory](source-inventory.json) records the three source checkouts,
  their commits, working-copy additions, destination paths and original hashes.
  The audit found no missing consolidated source paths.
- [Historical sources](historical-sources.tar.gz) preserves exact prior versions
  of campaign-specific source, including changes that have since been superseded
  by newer shared helpers. It also contains report publishers, queue scripts,
  original plan/PDF generators and requirement excerpts. These historical scripts
  can contain original workspace paths; extract them for recovery or inspection,
  not as the current runner.
- [Report snapshots](report-snapshots.tar.gz) preserves the plans, full matrix,
  ownership PDF/HTML, record-preservation reports, PR approval ledger, accepted
  findings and follow-up reports. [Report inventory](report-inventory.json)
  records each original path and content hash. Relative evidence links in these
  snapshots still require the original evidence tree.
- [External evidence inventory](external-evidence-inventory.jsonl.gz) records
  paths, sizes and modification times for the original evidence tree under
  `/Users/sg/Documents/ChatGPT/ENS/replacement-readiness`. The roughly 14.3 GB of
  raw evidence remains there; it is not duplicated in Git. This inventory is a
  presence record, not an atomic backup or content-hash audit. The live campaign
  continues adding files.
- Original ignored run directories and Docker chain/indexer volumes remain in
  their existing checkouts. They are required for dependent history replays.

Accepted findings retain their failed assertions and separate acceptance status.
Manual wallet failures and verified workarounds are not converted into automated
passes. Source completeness and collection success do not establish app parity.

## Commands

From the repository root:

```sh
# Collection and mapping only; does not start a chain or execute 4LD cases.
pnpm --dir e2e test:replacement:coverage
pnpm --dir e2e test:replacement --list

# Strict failure propagation and record-oracle regressions; no live chain.
pnpm --dir e2e test:replacement:harness

# Current 2LD/3LD scope: choose the explicit eligible configuration IDs.
MATRIX_MAX_LEVEL=3 pnpm --dir e2e test:migration-matrix --layer=core --ids=CFG-0003 --list
```

The replacement command explicitly selects the replacement suite; the matrix
command retains the current matrix runner. DNS and legacy stateful suites remain
excluded. Historical 4LD source is retained for provenance, while 4LD execution
remains excluded from the active campaign. `MATRIX_MAX_LEVEL=3` is a fixture and
operation guard, not a substitute for selecting 2LD/3LD IDs. Do not invoke an
unfiltered historical full-suite run for the current scope.

See the [replacement runner guide](../../e2e/projects/replacement/README.md) and
[matrix runner guide](../../e2e/projects/migration-matrix/README.md) for independent
fixtures, indexer requirements and evidence limits.

## Consolidation validation

- E2E type checking passed.
- Replacement collection: 497 checks, 260 executed legacy IDs, zero missing mappings.
- Nine strict-reporter/record-oracle checks passed.
- Both public commands selected their intended suite in collection mode.
- The prior integration validation passed 36 browser harness regressions,
  173 migration-helper unit tests and two RPC/cache regressions.

The active test campaign remains in `test/pr1494-approval-36`. No services were
restarted, and no new app execution results were assigned to this branch.
