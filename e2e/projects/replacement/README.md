# Independently runnable replacement regression tests

This runner covers the cases executed for the V1 replacement report. DNS and the
18 legacy `stateful/` cases stay excluded. Writing to an isolated test chain to
exercise migration is not the excluded legacy stateful suite.

## Prerequisites

- Node 24, pnpm, Docker Compose, Foundry `cast`, and Chromium installed by Playwright.
- Install workspace dependencies with `pnpm install --frozen-lockfile` and run
  `pnpm --dir e2e exec playwright install chromium` on a clean checkout.
- An archive-capable Sepolia RPC (`SEPOLIA_FORK_URL`) serving `e2e/infra/fork-block`.
  The stack has a default provider, but a clean machine needs network access.
- For the legacy, indexed-migration and cross-app lanes: the patched bigname Docker image described
  in `../../infra/bigname/README.md`. Supply `BIGNAME_IMAGE` if it has another tag.
- MetaMask legacy cases require a graphical display (or Xvfb on Linux) and the
  pinned official extension download. No user wallet or seed phrase is used.

The runner starts a new Compose project, volumes, chain and indexer for each
invocation. It refuses occupied test ports and never resets an existing stack.
Anvil has a 16 GiB limit and the indexer an 8 GiB limit. Real-indexer runs require
at least 28 GiB assigned to Docker; 48 GiB is recommended. The indexer backfills
from the ENSv2 deployment, including the root registry history. A fresh backfill
can take an hour or more; the startup deadline is two hours. No chain-history pruning
is enabled. The fork block is pinned; the chain clock is advanced to the run time.
Historical RPC concurrency defaults to 2 to limit public-provider throttling;
`BIGNAME_UPSTREAM_IN_FLIGHT` can match the limits of your archive provider.

## Commands (repository root)

```sh
# Collection and case mapping; no infrastructure needed
pnpm --dir e2e test:replacement:coverage
pnpm --dir e2e test:replacement --list

# One case from a new chain; no prior test or report is required
pnpm --dir e2e test:replacement --project=after-migration --grep 'AM07 sync'
pnpm --dir e2e test:replacement --project=after-migration --grep 'AM03 edit'
pnpm --dir e2e test:replacement --project=after-migration --grep 'AM07 dates'
pnpm --dir e2e test:replacement --project=records --grep 'RP01:'
pnpm --dir e2e test:replacement --project=legacy --grep '\bL085\b'
pnpm --dir e2e test:replacement --project=migration-indexed --grep '@scenario:GW4'
pnpm --dir e2e test:replacement --project=migration-indexed-eoa

# All executed-case lanes, continuing to subsequent lanes after failures
pnpm --dir e2e test:replacement

# Prove failure handling and reject unmigrated targets, record loss and empty results
pnpm --dir e2e test:replacement:harness
```

Known product gaps are expected to make the regression command exit non-zero.
Do not use the audit JSON's presence or Playwright's “expected failure” classification
as a success criterion. The strict reporter requires actual `passed` results for
all selected tests. Runtime skips are incomplete coverage and make the gate fail.

## Isolation and assertions

- Every after-migration action creates and populates its own V1 name tree, performs
  migration, then checks its selected operation. Migration status is asserted;
  an omitted child cannot produce a green after-migration check.
- Date tests create their own names. They do not read `AMxx.json` from a previous run.
- The gas-recovery lane creates a new wrapped-child fixture. It only considers
  out-of-gas receipts from that fixture's block range and actor, and replays the
  current calldata after simulation. No recorded transaction hash is an input.
  Ordinary migration tests do not silently retry failed transactions.
- Transfer and record writes are checked against the chain. Set Resolver delegation
  is verified independently; this does not certify every resolver role.
- Record-preservation tests seed their inventory, resolve before migration and
  compare afterward. Each target must be registered in V2; an unchanged V1 child
  cannot pass just because its old records still resolve. Failed status reads are
  marked unverified, while confirmed omitted targets are marked not migrated.
  Either result fails the test, as does any record mismatch.
- Legacy tests create their own fixtures. Select any case with `--grep` to run it
  against a new stack. Within a multi-case invocation the chain is shared, tests
  run serially, and names are uniquely seeded; the runner does not claim to roll
  back the real indexer between cases.
- The local faucet endpoint confirms fixture wallets are already funded. It does
  not test the production faucet, backend authentication or external services.
- Discovery is mocked for the after-migration, record-preservation and focused
  migration lanes, matching those tests' inputs. Legacy and cross-app lanes use
  the isolated real indexer. The indexed-migration projects also use that indexer;
  the direct-wallet project restarts Manager with the required signer mode.
  Environment-specific cases are assigned to the matching project rather than
  skipped. No local run certifies production indexer history.

## Coverage and evidence

`coverage-manifest.json` lists all 260 legacy cases with prior pass/fail results,
all 17 record-preservation cases, and the 21 after-migration scenarios. Each of
the latter has separate migration, transfer, ETH edit, role grant, sync and date
checks. Five extra fresh-fixture checks exercise gas recovery for scenario 10.
Existing focused migration tests are also collected.

| Project | Collected checks | Purpose |
| --- | ---: | --- |
| `legacy` | 267 | All 260 executed legacy IDs, plus supporting checks |
| `after-migration` | 131 | 21 scenarios × 6 checks, plus 5 recovery checks |
| `records` | 10 | Record inventories for RP01–RP10 |
| `migration` | 80 | Focused migration tests with mock discovery, including 7 record tests |
| `migration-indexed` | 5 | Migration and renewal cases requiring live index updates |
| `migration-indexed-eoa` | 1 | Partial renewal and retry using the direct wallet |
| `cross-app-migration` | 3 | Existing workflows across both apps |
| **Total** | **497** | Collection coverage, not a claim that all checks pass |


The manifest separately retains excluded, not-applicable and unexecuted cases.
L311 (external Safe-wallet integration) never completed execution and is not
represented as an automated pass. Broad permission combinations still described
as unverified in the report are not silently added to the completed inventory.
Some legacy cases previously stopped at a missing action. Their tests retain that
assertion boundary; where later legacy steps have never run, a guard prevents a
newly visible button from being mistaken for completed end-to-end coverage.

Evidence goes to `e2e/.replacement-runs/<run>/<project>/`: per-test traces,
screenshots and JSON, Playwright results, and `strict-results.json`. The root
contains service logs and a generated, private Compose configuration. That file
can contain the upstream URL; do not publish it. Containers and fresh volumes are
removed on exit; evidence is retained. `test:replacement:coverage` produces the
legacy-to-test mapping under `e2e/test-results/replacement/coverage.json`.

The historical HTML/PDF are snapshots of their original execution. New regression
runs do not overwrite or reinterpret those results automatically.


## Validation on 24 October 2026

Collection and mapping passed: 497 checks, all 260 executed legacy IDs, no
coverage errors. Type checking passed. All nine harness probes passed, including
proof that real failures, expected failures, runtime skips, unmigrated targets,
record mismatches and empty inventories return a failing exit code.

Representative browser checks were run from newly created stacks:

| Check | Actual result | Evidence / interpretation |
| --- | --- | --- |
| AM03 ETH edit, retained separate manager | FAIL | Migration completed; Explorer explicitly denied record editing for that wallet. |
| AM07 sync | PASS / N/A | Freshly migrated V2 name has no V1 sync-manager control. |
| AM07 ETH edit | PASS | Explorer saved the record; resolution readback matched. |
| AM07 dates | PASS WITH WORKAROUND | Expiry checked against the chain; parent expiry required parent navigation. |
| AM10 sync, recovery-enabled fixture | PASS / N/A | Wrapped child migrated normally. No gas replay was needed, so the replay branch was not exercised. |
| L029 manager-only Create subname entry | FAIL | Full-history indexer was ready; the page loaded and the connected manager's Create subname link was absent. This runtime failure requires separate diagnosis. |
| RP10 root, child and grandchild records | FAIL | All three targets had V2 status 2. All 36 before-migration comparisons matched. After migration, 30 matched; pubkey resolution reverted and the interface record returned zero on each target. This does not prove stored bytes were deleted. |

The final real-indexer run reached published block 11900082 and verified the
root `.eth` registry entry before starting the browser. Both selected projects
returned exit code 1 and the isolated containers/volumes were removed. The
original manual environment was left running.

Local evidence folders under `e2e/.replacement-runs/`:

- `replacement-1792825834268-60343`: AM03 edit and AM07 sync. Its early date
  attempt had a locator error and is superseded by the next run.
- `replacement-1792826468879-88735`: AM07 edit/dates, AM10 sync and an initial RP10 run.
- `replacement-1792828746146-82838`: corrected legacy configuration, fresh full-history
  indexer, L029 and strengthened RP10 migration-status/record assertions.

The intervening `replacement-1792826955649-12222` browser attempt is invalidated
in its `validation-note.json`; do not use it as product evidence.

This is representative execution, not a rerun of all 497 checks. The new
indexed-migration project allocation and direct-wallet restart path passed
collection/type checks but have not been browser-executed in this validation.
