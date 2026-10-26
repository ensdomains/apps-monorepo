# Migration retention matrix

Candidate: `6d24b082f11a8ed0d2500281ac06d5e76b4fc72e` (PR #1494).
The manifest contains 986 valid ownership/lifecycle configurations and 6,218 wallet rows. DNS and the original legacy stateful suites are excluded. Every core/UI/action scenario creates fresh names; tests do not consume names from a preceding test. Mutations are serial within each chain. Read-only wallet observations may run concurrently.

## Fresh local run

From the repository root, with dependencies installed, Docker available, and the existing local `bigname:e2e-anvil-fork` image built according to `e2e/infra/bigname/README.md`:

```sh
pnpm --filter @ens-apps/e2e test:migration-matrix --layer=core --ids=CFG-0003
pnpm --filter @ens-apps/e2e test:migration-matrix --layer=ui --ids=CFG-0003
```

Omitting `--ids` runs all configurations for `core` and the layers using the full-configuration spec. Supplemental layers have small default selections; supply their explicit eligible IDs to reproduce the campaign coverage. Use `--list` to inspect the exact selected tests first. The runner creates an isolated Docker project and temporary app servers, checks reserved ports, funds local test wallets, pins the fork in `e2e/infra/fork-block`, and returns a nonzero exit status for failed assertions or collection errors. It cleans up its own environment on exit. It does not touch the manual `infra` Docker project. Use `MATRIX_PORT_OFFSET=800` for a different unused port range.

The default fork endpoint must serve historical storage at the pinned block. Set `MATRIX_FORK_UPSTREAM_RPC_URL` when a different archive endpoint is needed; this configures the new environment's actual caching upstream and does not replace missing state with synthetic answers. For indexed history, set `MATRIX_REAL_INDEXER=1` and provide an archive-capable `MATRIX_HISTORY_RPC_URL` in the environment if the default provider prunes historical logs. Do not put private RPC URLs in committed files or logs. The indexer begins at the ENSv2 deployment floor and includes every newly created fixture event; this is not an assertion that every older mainnet/Sepolia V1 event has been indexed.

## Layers and evidence limits

| Layer | What actually runs | Important limit |
| --- | --- | --- |
| `core` | Fresh tree, actual migration through Manager, exact before/after resolution, source storage, token/role/expiry reads, permitted/denied contract simulations | Seeded discovery; simulations do not prove app actions |
| `ui` | Core plus separate Manager/Explorer sessions for each wallet, record display, actual permitted edits/readback/cleanup, denied entries, identity/action pages, namespace transfers and primary-name checks | Renewal, deletion and resolver import remain separate; dates use an actual published indexer |
| `ui-records` | Fresh core and both apps for every wallet, with committed record edits, exact readback and cleanup | A focused independent rerun of record and identity screens; excludes namespace, primary and date workflows, which retain separate evidence |
| `namespace` | Fresh core fixture plus Explorer resolver changes and subname creation for each wallet before and after actual migration/refusal, exact pointer/holder checks and cleanup; migrated names additionally exercise role delegation and transfer for each wallet | Separate from record-editor coverage; explicit loaded refusals required; temporary children removed before migration |
| `primary` | Every wallet submits its own reverse claim before migration; after migration/refusal verify the exact raw claim, universal forward match and Explorer Primary name badge; restore the exact original wallet reverse state | A stored unmatched reverse string is not counted as a verified primary name |
| `namespace-legacy` | Namespace workflows plus actual V1 full transfers and split-owner reclaim; restore exact holder, manager, resolver, fuses/expiry and records before the next wallet and migration | A loaded authorized-wallet denial remains a failing assertion; cleanup failure aborts the fixture. If the live wrapped subname holder is zero, assert the explicit expired transfer refusal and test parent re-issue separately. Parent set-owner permission does not prove an existing token is transferable. |
| `dates` | Before/after public expiry and grace dates in both apps, for the subject and seeded ancestors; real published indexer and actual contract dates | Starts a real indexer on a clean run. Registration dates are captured separately; this does not imply their preservation has passed |
| `actions` | Actual primary name, registry grant, resolver change, subname creation and ownership transfer | Default explicit subset; select a compatible configuration; these are not automatically all matrix rows |
| `resolver` | Supported resolver import, JSON-object ABI regression, populated pubkey guard, failed-read guard and retry | Independent direct-child scenarios; does not imply every resolver implementation passed |
| `setters` | Retained manager’s seven real setters, no admin/relink authority, cross-name isolation | Independent split-manager scenarios |
| `legacy-transfer` | Fresh V1 holder/manager/unrelated sessions; actual full transfer or grace/authorization refusal; split-owner reclaim | Full transfer changes both registrar and manager where applicable; it is not independent owner-only or manager-only parity |
| `refusal-transfer` | Actual Manager migration refusal, unchanged tree and wallet authority, then an independently submitted V1 transfer/reclaim or explicit denial | Select configurations whose actual migration outcome is refusal; no before-only equivalence |
| `refusal-controls` | Actual Manager refusal then child deletion/denial, preserving parent records and original child source storage | Separate fresh fixture per wallet; active, grace and expired child checkpoints are supported |
| `grace-recovery` | Fresh V1 child below a V2 ancestor in grace; actual Explorer ancestor renewal, child edit, and Manager child migration with exact records | A queued scenario is not a verified workaround; only completed assertions establish recovery |
| `v1-grace-recovery` | Fresh V1 root; check Explorer renewal entry, use Manager if the entry is missing, then verify actual expiry extension, exact 18-record preservation, resolver change and record edit | A missing entry still fails. Both apps’ post-renewal editor results are asserted; a verified Explorer recovery does not erase a Manager failure. New runs also assert the registrar/wrapper holder, protection fuses and expiry offset. This does not migrate the name or count editing after renewal as editing during grace |
| `expired-reissue` | Fresh expired wrapped child; authorized parent uses the advertised re-issue route with the exact existing label, then checks the actual recipient and all tree records | Re-issue is separate from migration eligibility. A blocked transfer is not by itself proof that the parent cannot re-issue; the alternative app route must actually complete |
| `parent-reclaim-transfer` | Fresh active unwrapped 3LD with a split parent owner/manager; follow the parent link, reclaim manager, then transfer the child and verify every tree record | This workaround deliberately displaces the old parent manager. A successful direct-transfer gate alone does not prove this recovery; exact controllers are restored after the independent test |
| `refusal-parent-reclaim-transfer` | Fresh Manager refusal with unchanged tree and wallet authority, then the parent-reclaim and child-transfer sequence in Explorer | Limited to active unwrapped 3LDs with split parent roles and recreation disabled; both names’ records and exact cleanup are asserted. This is an after-refusal V1 workflow, not V2 retention |
| `controls-before` | Fresh V1 child for each holder, parent holder, root owner and unrelated wallet; actual Explorer deletion or loaded permission denial | Includes active, grace and expired child checkpoints; compares the exact baseline rather than requiring already-unresolved names to resolve |
| `controls` | Fresh migrated child for each holder, parent and unrelated wallet; actual Explorer deletion or loaded permission denial | Active subnames only; parent and original source records are checked after deletion |
| `history` | Real paginated indexer history and Explorer, comparing previously saved fixture transactions/logs | Explicit dependent evidence replay; must use the same preserved chain |

`MATRIX_MAX_LEVEL=3` rejects 4LD fixtures and explicitly excludes operations that would create a 4LD beneath a 3LD subject. Select 2LD/3LD configuration IDs; excluded creation operations are recorded in `scopeExclusions` and never counted as passes. Other record, role and permission assertions remain unchanged.

`MATRIX_RECORD_PROFILE=extended` expands the fresh record fixture from 7 to 18 entries (extra text, non-EVM address, ABI encodings and interface). Discovery must enumerate all seeded keys. The app reads values and permissions from actual contracts; neither successful permission calls nor transaction receipts are stubbed.

App discovery selects V1 or V2 separately for each name using its actual registry state, including a lapsed V2 ancestor. Grace metadata uses the chain checkpoint rather than the host clock. App evidence records `inventoryVersion`; older mixed-protocol or post-refusal observations affected by discovery corrections require a fresh run. Owner-side manager assignment is probed through registrar `reclaim` with a different recipient, separately from direct registry `setOwner` and self-reclaim.

`MATRIX_HISTORY_RICH=1` adds real pre-migration renewal, holder-transfer round trips, record edits and resolver changes to fresh fixtures. These setup transactions supply known activity identities; they are not counted as app workflows. Use it with the core layer before replaying real indexed history.

## Reuse an isolated prepared environment

Start the environment with `MATRIX_PREPARE_ONLY=1 node e2e/scripts/run-replacement.mjs`. Keep that process alive. Its output gives an `e2e/.migration-matrix-runs/<run>/ready.json` path. In another terminal:

```sh
MATRIX_READY=e2e/.migration-matrix-runs/<run>/ready.json \
MATRIX_OUTPUT=/absolute/path/to/fresh-results \
pnpm --filter @ens-apps/e2e test:migration-matrix --layer=core --ids=CFG-0003
```

Every run writes original observations, screenshots and a strict Playwright result. `run-context.json` records candidate and initial harness hashes. During the development campaign the harness was corrected between batches; invalid fixture runs retain their evidence and a reason, and are rerun. Do not treat a later harness assertion over old observations as a new app execution.

For history, preserve the chain and enable its real indexer, wait for `indexed_block` to pass the fixture’s saved `afterActivity.toBlock`, then provide the absolute original run directories:

```sh
MATRIX_READY=e2e/.migration-matrix-runs/<run>/ready.json \
MATRIX_OUTPUT=/absolute/path/to/fresh-history-results \
MATRIX_HISTORY_DIRS=/absolute/path/to/original-results \
pnpm --filter @ens-apps/e2e test:migration-matrix --layer=history
```

An absent or lagging indexer fails readiness; empty mocked history never counts as a pass. Do not reset/revert a live indexed chain. Concurrent shards use separate chains/databases; only a proven common pre-fork archive/cache may be shared.

## Reading results

`--layer=ancestor-records` runs fresh independent record checkpoints for active emancipated subnames with V2 ancestors in grace (optionally select a configuration with `--ids=CFG-0856`). It captures all 18 records per name before ancestor migration, immediately after each ancestor migration, and after the ancestor enters grace. Original stored bytes, public resolution, effective child ownership, exact receipt blocks and clock boundaries are asserted separately. It reads the current chain head, so missing bytecode in an older historical snapshot cannot masquerade as record loss. This contract-only layer does not claim a successful subject app migration, permission workflow or indexed-history test. It uses one separate browser-free slot and a 2 GiB process heap; the browser fixture limit is unchanged. DNS and the legacy stateful suites remain excluded.

PASS means a specific executed assertion matched. FAIL means it did not. BLOCKED identifies failed setup/readiness. NOT RUN identifies absent evidence. Contract ALLOWED/DENIED and partial checks never become a full actor-row PASS. A refused migration passes only when the expected reason and unchanged records/authority are proved. Known app gaps remain test failures; they are not hidden with expected-failure markers. The report publisher maps findings, actual workaround evidence and original source files to the configuration rows.

The user-confirmed grace editing policy requires renewal before record editing, even when a resolver call remains authorized. A committed edit during grace fails; a loaded renewal gate passes this specific policy check. Separately, `MIGRATION-GRACE-01` requires active emancipated children to migrate independently while an already-migrated V2 ancestor is in grace. A loaded ancestor-grace migration refusal fails that requirement; unchanged-state assertions still run afterward. Expired children and an unmigrated required parent remain separate cases. The live root expiry is re-read so a successfully renewed fixture is tested as active.

Refused migrations also assert that the original resolver's seeded subject values were readable before the attempt and that the decoded values and raw return bytes are identical afterward. Identical resolution errors cannot satisfy this storage check. Missing snapshots are NOT RUN; failed reads are BLOCKED; a changed or missing value fails. Reassessing earlier saved reads with a newer oracle is labelled separately from a fresh execution.

Configured-resolver storage checks use the V1 getter directly for PublicResolver and `resolve(name, getterCalldata)` for PermissionedResolver. The latter does not expose a `text(bytes,string)` getter. Earlier cleanup failures from that unsupported getter are retained as harness-blocked evidence and require an actual fresh app run; they do not establish a failed app edit or missing record.

Explorer record-edit assertions wait for an actual editor or explicit permission denial. An empty screen at the readiness deadline is BLOCKED, never a successful denial or a confirmed permission defect. Fresh checks capture browser exceptions and request hosts; explicit app errors remain FAIL. Manager permission readiness is matched to both the exact name and connected wallet.

Full `ui` and `namespace` runs include reversible V1 transfer/reclaim and all-wallet primary checks and real-indexer public dates by default (`MATRIX_LEGACY_TRANSFER_ACTIONS=0`, `MATRIX_PRIMARY_ACTIONS=0`, and `MATRIX_DATE_ACTIONS=0` opt out explicitly). Successful direct migration cases additionally run the V2 transfer and role checks. Date checks run in independent public contexts on the same fresh fixture; clean UI/namespace runs start the real indexer. These options and the exact harness hashes are recorded in the run manifest.

Post-migration primary-name checks require a successful before-stage app submission and exact reverse-record readback for that same wallet and fixture. Saving the original reverse value for cleanup is not proof that the claim was set. When the before-stage claim is blocked, the dependent after-stage check is BLOCKED, not evidence of a lost primary name; rerun both checkpoints on a fresh fixture.

Post-migration child-deletion checks advance to the configured lifecycle before taking their baseline, and honor the selected Keep/Remove manager option. An unlocked child's elapsed wrapper timestamp remains eligible for recreation; it is distinct from an expired emancipated child. The expected deletion authority comes from the retention requirements, not from the measured permission. Each connected wallet gets a fresh migration and its own actual deletion or settled denial check. Collecting these tests is only a harness check and never counts as a behavioural pass.

For example, run one independent deletion wallet case with `MATRIX_ALL_ACTORS=1 MATRIX_RECORD_PROFILE=extended MATRIX_HISTORY_RICH=1 pnpm --filter @ens-apps/e2e test:migration-matrix --layer=controls --ids=CFG-0245 --grep 'subname control CFG-0245 W1$'`. Remove `--grep` to run every connected wallet for that configuration. For a subsequent history replay, use the prepared-environment procedure above with its real indexer enabled, and supply `MATRIX_READY` and a fresh `MATRIX_OUTPUT` to the deletion run. Its evidence captures original and final activity plus per-name registry bindings.

History assertions distinguish retained V1 activity from subsequent actions. `semantic-activity-v3` accepts only proven same-transaction/name/contract/value duplicate event representations. `post-activity-v1` additionally compares exact post-baseline V2 per-name record, role and transfer events and subsequent V1 actions after a refusal. Missing publication is BLOCKED; a published missing event fails. `per-name-v2-baseline-v1` also compares existing V2 history, including prior migrated-ancestor events. An older history pass does not certify newly added assertions.

`all-fixture-transactions-v1` additionally requires every original and post-baseline fixture transaction to be reachable in expanded Explorer history, loading older pages as needed. The expected links come from original transaction identities and exact real-indexer rows within the fixture's verified block interval. A missing transaction fails even when another sampled original transaction is visible. Earlier API-plus-one-link passes remain limited evidence; they do not satisfy this expanded browser check.

`settled-load-more-v1` waits for pagination to finish before checking the next page: the temporary `Loading…` button is not the end of history. A delayed-page browser regression and a genuine missing-link regression guard this distinction. An old missing-link failure from the incomplete wait needs a fresh exact-fixture replay; it cannot establish lost activity by itself.

Both parent-reclaim layers and post-migration deletion checks capture original and post-workflow activity, including controller restoration or actual deletion where applicable. Their action/record PASS does not establish indexed activity retention. To replay one of these supplemental fixtures, place a symlink to its completed supplemental JSON at `<history-input>/observations/CFG-xxxx.json`, then use that input directory as `MATRIX_HISTORY_DIRS` with the same preserved chain. The history layer verifies every fixture name against the real indexer and Explorer. Older supplemental outputs without activity checkpoints require a fresh run; their earlier app assertions remain separate evidence.

Resolver-import fixtures also apply the selected lifecycle and Keep/Remove manager choice before migration. Split-manager fixtures assert the resulting root registry and resolver grants. Their activity checkpoints include the later import, a blocked import where applicable, and any resolver restoration. Replay these supplemental JSON files through the same preserved-chain procedure. A completed import that loses records can still have retained activity: keep its record-copy FAIL separate from the history result. An unfinished import or failed restoration does not qualify as a completed workflow history check. Older resolver-import runs without these checkpoints do not prove indexed activity retention.

Local development JS/CSS is cached by exact URL and Vite version to avoid repeated downloads after Playwright routing disables its ordinary cache. Set `MATRIX_CACHE_APP_MODULES=0` to disable. HTML, RPC, API, permissions, wallet requests and record reads stay live. The run manifest discloses the cache.

Prepared local runs share a browser-fixture capacity pool (four fixtures by default, including history replay). Admission waits before fixture setup, so a waiting job is not an executed test. Waiting fixtures run in arrival order, with short read-only history checks first so completed chains can be archived without starvation. Set `MATRIX_RESOURCE_POOL` to choose a separate pool; its `capacity.json` may set `maxConcurrentFixtures`. Exited workers release stale slots automatically. This bounds resource pressure across otherwise independent chains without changing app behavior or assertions. Prepared test processes default to an 8 GiB JavaScript heap (`MATRIX_TEST_HEAP_MB` overrides it), recorded in each run context; this does not change chain, indexer or app memory settings. A headless-wallet request that fails to settle before the transaction deadline is BLOCKED and requires a fresh fixture; it never counts as an app permission result. Record, namespace, primary-name and supplemental action checks also stop the entire fixture at that point: a timed-out sender can still commit after cleanup, so later actions and migration cannot use that baseline. The original attempt and any late transaction remain diagnostic evidence.

Within a fixture, namespace checks may overlap only for disconnected wallets or wallets whose measured permission probes all deny. Allowed parent reassignment, blocked reads and missing authority remain serial. All reader contexts settle before any writer starts; reverse-name claims remain serial because they are writes even when the wallet cannot edit the subject. `MATRIX_UI_READ_CONCURRENCY` bounds readers (default two). This changes scheduling only, not assertions, transaction cleanup or navigation deadlines.

Browser-only harness regressions need no chain or indexer: from `e2e`, run `node node_modules/@playwright/test/cli.js test -c projects/migration-matrix/playwright.harness.config.ts`. The role-diagnostic check preserves exact uint256 values despite Portal's JSON shim; numeric values in older diagnostic snapshots can be rounded and must not be used for exact bitmap comparisons. Actual contract assertions record exact decimal strings separately.

V1 transfer authorization checks the holder and parent-reassignment routes independently. The parent probe matches the app's exact subject-contract intent; wrapped reassignment passes zero fuses and expiry to retain existing values. A child-holder denial alone cannot justify expecting a parent wallet's transfer to be denied. Committed app transfers still assert the actual recipient, preserved records and wrapper values, and exact restoration before migration. Earlier holder-only false failures retain their raw evidence and are marked harness-blocked until a fresh parent-wallet execution completes.

The shared retention oracle checks the complete before/after resolution inventory for every seeded tree member, so a successful subject check cannot hide a changed or missing ancestor. Equal pre-existing resolution errors establish continuity only; they do not establish readable source storage or successful V2 copying. Refusal source assertions separately require readable original values and exact return bytes. Applying an updated oracle to saved reads is reported as saved-evidence analysis, not a fresh app run.

## Focused 2LD/3LD follow-up

The `priority-permissions`, `priority-races`, and `priority-conflict` layers create
fresh 2LD/3LD fixtures. DNS, all 4LD cases, and legacy dependent stateful suites
are excluded. Use the normal clean runner or the prepared-environment procedure:

```sh
MATRIX_RECORD_PROFILE=extended pnpm --filter @ens-apps/e2e test:migration-matrix --layer=controls --ids=CFG-0015,CFG-0711
MATRIX_RECORD_PROFILE=extended pnpm --filter @ens-apps/e2e test:migration-matrix --layer=priority-permissions
MATRIX_RECORD_PROFILE=extended pnpm --filter @ens-apps/e2e test:migration-matrix --layer=priority-races
MATRIX_RECORD_PROFILE=extended pnpm --filter @ens-apps/e2e test:migration-matrix --layer=priority-conflict
MATRIX_RECORD_PROFILE=baseline-7 MATRIX_S4_VARIANT=cancel-review,reject-first,reject-after-setup pnpm --filter @ens-apps/e2e test:migration-matrix --layer=resolver --ids=CFG-0015
```

Permission cases use actual Manager migration, signed grants/revocations and
reverted unauthorized transactions. Reclaim/re-registration is checked directly
against the canonical contracts; it is not an additional Explorer UI pass.
Retained-manager editor denial is checked separately in both apps. The existing
`controls` layer supplies the Explorer deletion checks.

Source-race tests mutate actual V1 data from a separate authorized wallet after
preview or immediately before the requested HCA migration transaction is sent.
They compare the newer source state with the final public resolution and owner.
User-confirmed rule MIGRATION-SOURCE-01 requires migration to stop and request
a fresh review after a source change. Proceeding with the old snapshot fails,
even when newer data happens to survive. These tests cover the wallet-request
boundary, not every mempool/inclusion race.

Resolver cancellation/rejection tests use the supported seven-record bundle by
default. They assert the source pointer and records survive interruption, then
verify the actual retry. This is not full ABI-encoding retention coverage.

Wallet-rejection scenarios preserve the provider’s numeric EIP-1193 error fields
across Playwright’s exposed-function boundary. The browser-only
`wallet-errors.harness.spec.ts` regression asserts that code 4001 reaches the
browser; it authorizes no transaction. A generic transport error is not evidence
of how the app handles a user rejecting a wallet request.
