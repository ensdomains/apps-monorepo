# The local e2e stack: bigname, the pinned fork, and offline mode

How the manager e2e suite runs on a laptop: what is in the stack, how it was
built, and the two switches people mix up (mock vs real index, online vs
offline network). For the bigname image and its runner details see
[`../infra/bigname/README.md`](../infra/bigname/README.md); this page is the
overview.

_Status, 2026-10-14: the pinned fork, both caches, online mode and full
offline mode are on `e2e-tests-coverage`. Offline mode was verified against an
online pass of the same suites (results below)._

---

## Why the stack looks like this

- The **manager** reads every name from **bigname** (PR #1324). bigname is a
  hosted service, and the hosted Sepolia API cannot see anything the suite
  creates on a local fork. So the stack runs its **own bigname**, indexing the
  local chain.
- The local chain is **Anvil forking Sepolia**, not an empty chain: tests need
  the real ENS V1 and V2 contracts, premigrated names, the migration
  controllers and test USDC, all as deployed on Sepolia.
- The **portal** still reads **Panoptes** and the V1 subgraph shim; those run
  beside bigname. (Portal e2e is parked until the portal moves to bigname.)

## What runs

```
                  browser (Playwright, headless wallet)
                    │                          │
           manager app (vite dev)        portal app
             │            │                    │
   chain reads/tx     names, records     Panoptes / V1 shim
             │            │                    │
             ▼            ▼                    │
        ┌──────────┐  bigname-api :5660        │
        │  Anvil   │◄─── bigname-runner        │
        │  :8545   │      │                    │
        │ (fork of │   bigname-rpc ──────► public Sepolia RPC
        │ Sepolia  │   (router + disk cache)   (old blocks, cached)
        │ @ pinned │                           │
        │  block)  │◄──────────────────────────┘
        └────┬─────┘
             │ fork reads
             ▼
       upstream-cache :8548 ──► public Sepolia RPC
       (disk cache)               (state at the pinned block)
```

| Service | Port | Role |
| --- | --- | --- |
| `anvil` | 8545 | Sepolia fork at the pinned block; everything the app and tests write lands here |
| `upstream-cache` | (internal 8548) | Anvil's fork upstream, cached on disk |
| `bigname-runner` / `bigname-api` | 5660 | the manager's indexer, following Anvil |
| `bigname-rpc` | (internal 8547) | routes the runner's reads: pre-fork blocks to the public RPC (cached), the rest to Anvil |
| `bigname-postgres` | 5661 | bigname's database |
| `mockestrator` | 3007 | stands in for Rhinestone's orchestrator (smart-account intents) |
| `alto`, `paymaster` | 4337, 3002 | bundler and paymaster for the HCA path |
| `panoptes-*`, `v1-subgraph` | 5655, 5656 | the portal's indexers |
| `anvil-mainnet` | 8546 | mainnet fork, used only by the metadata service |
| dev servers | 3000/3001 (yours); 3010 manager + 3011 explorer with the mock wallet (manual testing); 3012 manager + 3013 explorer without it (Playwright) | all from this checkout |

Start everything with `bash e2e/infra/scripts/start-local-env.sh`; stop with
`--down`.

## How it was built (what is non-standard)

1. **A patched bigname image.** Stock bigname refuses a Sepolia source that does
   not start at block 0. The image `bigname:e2e-anvil-fork` is built from the
   bigname branch `e2e/anvil-fork-start`, which adds a dev-only flag
   (`BIGNAME_DEV_ALLOW_SEPOLIA_START=1`). It also carries a fix for a stall
   when Anvil mines two blocks in the same second (E2E-022, commit `0f6c2171d`).
   That branch is local and unpushed. Build steps: the bigname README.
2. **Index from just below the fork.** The runner starts 2,064 blocks below
   Anvil's fork block (`BIGNAME_START=fork`), not at genesis: a couple of
   minutes of backfill instead of hours. Names that existed before the fork are
   partial; the suite makes its own.
3. **A fork-aware router (`bigname-rpc`).** The runner reads every header and
   log in its range. Sent through Anvil, each read is forwarded upstream one at
   a time and Anvil stops answering anyone else. The router sends pre-fork reads
   straight to the public RPC and the rest to Anvil.
4. **Reset rules.** bigname cannot follow a different chain with the database it
   indexed before. `start-local-env.sh` wipes and reindexes it whenever Anvil's
   fork block changes **or Anvil restarts** (a restarted Anvil forks the same
   block but drops its local history).
5. **Test helpers that wait for the index.** After a write, specs wait for
   bigname to publish the block, the name and its record keys
   (`helpers/bigname-sync.ts`); bigname lists record keys about 1 s after the
   block, and reading earlier silently loses records (E2E-024).

## Switch 1 — mock or real index (`E2E_MOCK_INDEXER`)

This is about **where the manager's name data comes from in a test**.

| `E2E_MOCK_INDEXER` | Name data | Used by |
| --- | --- | --- |
| `true` | Playwright route-mocks bigname in the browser (`helpers/mock-indexer.ts`, `mock-v1-names.ts`); the chain is still Anvil | CI, fast local runs |
| `false` (default locally) | the local bigname on :5660 | real-mode runs, anything needing subname trees or real indexing |

Mock mode cannot express V1 subname trees (those specs skip) and reports
whatever the test tells it; real mode catches indexing bugs and lag, at the
price of the bigname stack.

## Switch 2 — online or offline network (`FORK_RPC_OFFLINE`)

This is about **whether the local stack talks to public Sepolia at all**. Two
things need real Sepolia data: Anvil (state at the fork block, read lazily) and
bigname's router (the pre-fork blocks it indexes).

### The pinned fork and the caches

- **Pinned fork.** Anvil forks the block in [`../infra/fork-block`](../infra/fork-block)
  (11898021 since 2026-10-15; it was 11898020, one block before Sepolia
  restored the reverse-registrar adapter), not the latest one. Everything at
  or below that block never
  changes, so every answer about it can be kept.
- **`upstream-cache`** sits between Anvil and the public RPC and keeps every
  answer at the pinned block on disk (`anvil-upstream-cache` volume). Anvil's
  own fork cache (`storage.json`, `anvil-fork-cache` volume) is kept too, but
  on its own it cannot start Anvil offline: Anvil still fetches the fork block's
  header.
- **`bigname-rpc`** keeps every upstream answer (pre-fork blocks, logs,
  transactions) on disk (`bigname-rpc-cache` volume). It looks transactions up
  on Anvil first: asking the public RPC first cost one request per test
  transaction and drew the rate limits that stalled bigname on 2026-10-12.
- **Chain clock and finality.** A pinned fork starts at its block's
  timestamp, and Anvil reports `safe` and `finalized` 1,024 and 2,048 blocks
  behind the head. bigname polls both, so for the first 2,048 blocks after a
  restart they fall before the fork and Anvil fetches them from the network
  (about 285 KB each), which stalls bigname offline. On a fresh fork
  `start-local-env.sh` therefore mines 2,048 empty blocks one second apart,
  ending at the wall clock: `safe`/`finalized` are local blocks from the start,
  and the clock is at now (intents and sessions are dated by the wall clock;
  HCA registration fails when the chain lags it). Later starts only step the
  clock forward, never back.

### Online mode (default)

`FORK_RPC_OFFLINE=0`. Cache misses go to the public RPC and are then kept.
Measured on 2026-10-12/13:

- bigname's router answered from its cache with **zero misses** across two full
  suite runs — bigname needs no network once warm;
- Anvil asks the public RPC only for state it has not seen (about 130 requests
  a minute during a suite run, within free-tier limits).

Both upstreams must be **archive** nodes: Anvil's reads all name the pinned
block, and bigname's router reads old headers. publicnode prunes Sepolia
history (on 2026-10-13 its earliest block was 11898570, past the pin), so it
cannot serve them; Tenderly, drpc and 1rpc can.

```sh
SEPOLIA_FORK_URL=https://sepolia.gateway.tenderly.co \
BIGNAME_UPSTREAM_RPC_URL=https://sepolia.gateway.tenderly.co \
  bash e2e/infra/scripts/start-local-env.sh
```

### Offline mode

`FORK_RPC_OFFLINE=1`, upstreams pointed nowhere. Nothing leaves the machine.

```sh
SEPOLIA_FORK_URL=http://127.0.0.1:9 BIGNAME_UPSTREAM_RPC_URL=http://127.0.0.1:9 \
FORK_RPC_OFFLINE=1 bash e2e/infra/scripts/start-local-env.sh
```

- Warm the caches first: one online run of the suites.
- Every run creates **new names** (timestamped labels), so Anvil keeps asking
  about storage slots no run has seen. At the pinned block those are empty, but
  only the network can say so. Offline, `upstream-cache` therefore answers an
  unseen read of a storage slot, balance, nonce or code as empty, an unknown
  transaction or receipt as not found, and an unseen log query as no logs. A
  block header is never invented; a missing one is an error.
- **Safety check.** Online, `upstream-cache` compares every real answer with the
  empty one it would have given offline and logs each difference
  (`non-empty first read: …`, and a count in its per-minute stats line). After
  a warm-up that count should stay at 0; if it does not, offline answers for
  those reads would be wrong. The EIP-2935 block-hash contract
  (`0x0000F908…2935`) is left out of the check: each new block makes Anvil
  load the slot it is about to overwrite, which on Sepolia holds an older
  hash, and nothing reads that old value back.
- Logs show what happened: `docker compose -f e2e/infra/docker-compose.yml logs
  upstream-cache` (hits, misses, answered empty) and `… --profile bigname logs
  bigname-rpc` (cache hits and misses).

**Verification, 2026-10-13/14.** A fresh fork each time, the manager suites
in real mode against 3012, first online (warm caches), then offline with both
upstreams pointed at a dead port:

| Suite | Online pass / fail / skip | Offline pass / fail / skip |
| --- | --- | --- |
| migration | 50 / 12 / 4 | 49 / 13 / 4 |
| migration-time | 11 / 0 / 0 | 11 / 0 / 0 |
| manager | 46 / 9 / 7 | 46 / 9 / 7 |

- The failing tests are the same online and offline, except one: GA3
  (`migration-approvals.spec.ts:265`), whose new name did not appear in the
  upgrade list once. Rerun offline on its own it passed twice: a flake, not
  offline mode.
- Offline, `upstream-cache` answered 15–20 unseen reads a minute as empty and
  bigname's router had no misses. bigname reached the head within seconds of
  starting, offline, from its cache.
- The online safety check found 11 non-empty first reads: 9 in the block-hash
  contract (now left out, see above) and 2 for an account whose earlier read
  had failed upstream (cached since). None of them affects offline answers.

### Moving the pin

After an ENS redeploy on Sepolia, or when you need newer Sepolia state: write
the new block to `e2e/infra/fork-block`, run online once to warm the caches, and
commit the file. `SEPOLIA_FORK_BLOCK=latest` forks the tip for a one-off run.

## Running the suites

```sh
cd e2e
# real index (local bigname)
MANAGER_APP_URL=http://localhost:3012 E2E_MOCK_INDEXER=false \
  npx playwright test --config=projects/manager/playwright.migration.config.ts
# mock index (as CI)
MANAGER_APP_URL=http://localhost:3012 E2E_MOCK_INDEXER=true \
  npx playwright test --config=projects/manager/playwright.config.ts
```

Start dev servers with `VITE_PUBLIC_POSTHOG_HOST=https://edge.ens.domains`:
`/upgrade` checks a PostHog flag server-side, and the host in older local `.env`
files no longer resolves, which sends `/upgrade` straight back to the
dashboard. Start two manager servers one after the other, not at once: their
Workers runtimes collide at startup.

## Manual testing on 3010

- Mock wallet: `VITE_USE_MOCK_WALLET=true` **with `VITE_FF_USE_EOA=false`**.
  With EOA on, the smart-account machine never runs and "Upgrade N names" does
  nothing when clicked.
- MetaMask against the fork estimates gas on real Sepolia (its own simulation,
  even with a localhost RPC), where your smart account does not exist, so
  migrations run out of gas. Use the mock wallet, or raise MetaMask's gas limit
  to about 700,000 by hand.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `bigname did not publish block … within 60000ms` | router upstream rate-limited (429) | online: switch `BIGNAME_UPSTREAM_RPC_URL`; the cache prevents a repeat |
| paymaster restarts with `pruned history unavailable` | the fork upstream is not an archive node (publicnode) | use Tenderly or drpc for `SEPOLIA_FORK_URL` |
| every test times out, Anvil exited 133 | public RPC dropped a connection mid-read | restart the stack; offline mode avoids it |
| suite-wide hangs after the laptop slept | Docker/OrbStack hang after sleep | `caffeinate -i` for long runs; restart OrbStack |
| setting a primary name (or any smart-account step) fails with "Internal Server Error" from `/orchestrator` | mockestrator still holds the previous fork's state, or the chain clock is far from the wall clock | `start-local-env.sh` restarts mockestrator on a fresh fork; otherwise `docker compose … restart mockestrator`, and step the clock to now (`evm_setNextBlockTimestamp` + `evm_mine`) |
| "Couldn't prepare your upgrade" for a moment after a migration | bigname has not indexed the parent's migration yet | wait a second; it clears |
| `/upgrade` bounces to the dashboard | dead PostHog host | start the server with `VITE_PUBLIC_POSTHOG_HOST=https://edge.ens.domains` |
| a wallet with no USDC still shows $10,000 | the dev build mints USDC to the owner on every load | block `/rpc` `mint` and `/wallet/fund` in the test (see B12) |

## History

**2026-10-19:** the local bigname image was rebuilt from bigname `main`
(`5982ba628`) plus the four dev patches, on the local branch
`e2e/anvil-fork-start-2026-10-19` (worktree `~/ens/bigname-e2e-rebuild`). The
manager since #1324's final version reads `/v1/resolvers/{chain}/{address}/records`
(bigname #1117), which the 2026-10-10 image did not serve — so every locked
migration failed closed with "Couldn't verify your name records". The new
image is tagged `bigname:e2e-anvil-fork` (the old one is kept as
`bigname:e2e-anvil-fork-2026-10-10`); after switching, reset bigname
(`reset-bigname.sh`).


#1324 merged to `main` on 2026-10-14 and `main` was merged here on 2026-10-15
(`5af31ea36`); the harness worktree is retired and the apps under test run
from this checkout. The stack was assembled on 2026-10-10 on the branch
`e2e/bigname-harness`
(local), merged into `e2e-tests-coverage`.
The pinned fork, the caches and offline mode were added on 2026-10-12/13.
