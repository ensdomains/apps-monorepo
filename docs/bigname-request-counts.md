# BigName migration: request counts

Checked 2026-10-06 against apps main `2e1dade90`. “Branch” includes the local
fixes on `claude/bigname-rest-v041` and targets the combined BigName main/next
release described in the [behavior summary](bigname-output-differences.md).
These are call-site counts, not measured live traffic.

Counts are HTTP requests for one cold logical read, excluding retries and
refreshes. Shared query caches mean screen totals cannot simply be added.
RPC actions are listed separately because providers may batch or split them.

- `P(n) = max(1, ceil(n / 200))`: ordinary collection pages, subject to each caller's guard.
- `B(n) = ceil(n / 1000)`: detail-lookup batches; zero inputs need no lookup.
- Old loops that stop only on a short page also request an empty terminal page for exact multiples.

## Reads that increase

| Operation | Main → branch | Reason / boundary |
| --- | --- | --- |
| Standalone Manager migration discovery | **1 → 2** for a small nonempty wallet; branch `P(names) + B(names + missing parents)` | Authority-filtered list then detail. This is an app choice: address detail lookup could combine a small read but also downloads ENSv2 holdings and lacks missing parents. Fresh dashboard authority rows save the list call. Empty wallet: 1. |
| Portal forward-resolution table | **1 → 2** for a small nonempty result; `P(names) + B(names)` | All-EVM membership omits the full Networks inventory. Numeric-coin reverse lookup can combine detail, but does not accept `coin_type=evm`. |
| Resolver overview | **1 → 4 minimum**; `2 + P(links) + P(roles)` | API separates overview, links, roles and events. Reads run concurrently. |
| Overview plus Nodes/picker | **1 → 4** for a small cold load; `2 + P(links) + P(roles) + P(nodes) - 1` | Nodes shares the overview's first bound-name page. Nodes alone costs `P(nodes)`. |
| Portal address names / Your Names / owned-name suggestions | **2 → 3 minimum** per address | Separate authority, ETH-resolution and former-owner/grace collections. Lookup cannot batch equivalent membership. Consumers share the same query cache. |
| Registry detach-impact check | **1 → 1** for a proven complete page ≤200 labels; otherwise **1 → 2** | Larger registries need a sequential exact `exclude_owner` count. Unknown total stops after one read and blocks the action. Always reads a fresh first page. |
| Manager landing redirect | **1 → usually 1**, up to 100 pages of 50 | Stops at the first dashboard-listed name; local filtering prevents using a total as the predicate. |
| Faucet eligibility | **1 → usually 1**, otherwise until match or completion | Old query filtered eligibility server-side. Branch filters locally with no app page cap; a read failure is not false. |
| One expiry stage window | **1 → 1–5** for up to 1,000 rows | BigName's page limit is 200. Whole-run batching reduces the number of small requests below. |
| Portal record history | **1 → P(events)** | Uncapped walk. Exact keys filter server-side; family views may read other keys before local filtering. |
| Portal address history | **2 → P(events) + P(held names)** | Current ownership attribution uses a separate `relation=owner` inventory. Both walks are uncapped; the teaser limits only its history page. |

## Shared reads, reductions and unchanged costs

| Operation | Main → branch | Notes |
| --- | --- | --- |
| Manager dashboard plus migration | One address: **3 → 3**; two addresses: typically **4 → 5** | For `A` addresses, branch list is `2A` walks (authority + grace), plus detail batches for migration. Migration shares its address's authority query and is independent of other accounts/grace failures. |
| Manager address profile | **3 → 1** for a small owned-only profile | One authority walk with role summaries replaces V1/V2/role reads. No grace walk on this profile. |
| Portal subname migration status | **1 → 1** | Batches name and possible parent. Only a required parent failure affects classification. |
| Full small expiry sweep | **7 → 2** | One publication-time probe plus one post-cutover `.eth` sweep, when its combined windows fit one page. Closed windows issue no read; dense windows add pages. |
| Exact-second expiry recovery | Up to **1 → 25** | Conditional reread when a page splits one expiry second. Branch covers up to 5,000 rows versus main's 1,000; overflow is reported. |
| Migration profile-key inventory | One request / **500 → 1,000** targets | Usually unchanged or fewer requests. Missing ABI inventory adds up to four on-chain ABI probes per name, not necessarily four HTTP calls. |
| Name-role holders/history | RPC log/timestamp reads → **1 detail + P(permission events)** | Up to 10 event pages; incomplete walks error. Provider-dependent RPC work has no fixed HTTP baseline. |
| Registry root holders/history | RPC logs → **1** for each small read | Holders and history are separate operations. No capability probe or RPC fallback. |
| Owned/migrated counts | **1 → 1** | Requests `include=total_count` immediately on a one-row page. Unknown total stays unknown; no older-contract retry. |
| Detail, grouped records, ordinary history/activity pages | **1 → 1 per page** | Contract-history totals are included in the same request. The full name timeline was already multi-read on main. |

## Conditional costs

| Trigger | Additional work |
| --- | --- |
| Role-summary `422 unsupported` | Same cursor at sizes 200, 100, 50, 25, 12, 6, 3, 1, then one plain one-row request: at most **9 attempts**. Each new cursor starts at 200. Smaller pages can add later requests. |
| Transport failure | Up to **3 retries** (4 attempts) for network errors, 408/429/502/503/504, stale responses and unpinned conflicts. No 500 retry. Pinned conflicts and aborts do not retry. |
| Continuation remains stale | Up to **3 restarts from page one**, after applicable request retries. Invalidated snapshots are discarded. |
| Refresh/invalidation/query-library retry | Repeats the applicable logical read. Recent activity polls every 30 seconds only while the first page is shown; post-write publication polling depends on indexing lag. |

Dashboard-backed migration inherits role-summary retries; cold standalone
discovery does not request them. Resolver first-page reuse requires the raw
entry to be resident and fresh (one-hour stale time, default five-minute
inactive garbage collection). A cached derived overview alone is insufficient.

Resolver safety/coverage checks and required migration-lookup validation add no
normal-path requests. The grace fix adds one bounded walk per relevant address.
The counts above include those changes.

## Evidence

The main call sites are
[Manager dashboard queries](../apps/manager/src/features/dashboard/service/queries/getDashboardNames.ts),
[migration discovery](../apps/manager/src/features/migration/service/v1Names.ts),
[Portal resolver reads](../apps/portal/src/features/resolver/hooks/useResolverOverview.ts),
[registry detach checks](../apps/portal/src/features/registry/hooks/useRegistryOccupants.ts),
[expiry discovery](../workers/api-worker/src/services/expiry-discovery/indexer.ts)
and [faucet eligibility](../workers/api-worker/src/services/v1-names/index.ts).
Request-count, cache/concurrency, pagination and failure regressions were
tested with mocks. The combined backend deployment has not been measured live.
