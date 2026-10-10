# Handoff: the e2e stack now runs bigname (2026-10-10)

For the session continuing e2e coverage and execution. Read this before the next
`/e2e-goal` iteration: the manager no longer reads Panoptes, and the stack it runs
on changed.

## TL;DR

- #1290 (api-worker → bigname) is merged to `main`. #1324 (manager → bigname) is
  open, conflicts fixed by its author. After #1324 the **manager reads only
  bigname**: no Panoptes, no ENSNode, no V1 subgraph. The **portal still reads
  Panoptes** and the V1 subgraph shim.
- Work lives on branch **`e2e/bigname-harness`**, worktree
  `/Users/sg/ens/apps-monorepo/.claude/worktrees/bigname-harness`:
  `e2e-tests-coverage` (at `e7ed77282`) + #1324 head `6e619f764` (which contains
  `main` and #1290) + the harness commits below. **Not pushed.** Continue e2e
  work on this branch, or merge it into `e2e-tests-coverage` once the user agrees.
- Locally the manager reads a **real bigname indexing the Anvil fork** (no
  mocks). CI keeps route mocks (`E2E_MOCK_INDEXER=true`).
- **Open blocker:** bigname's interpret phase stalls on chains the V1 fixtures
  touched (details below). It must be fixed before the manager suites can give a
  clean signal locally.

## Commits on `e2e/bigname-harness`

| Commit | What |
|---|---|
| `c912b2943` | merge #1290 (old head; superseded by main's squash `3ba12f703`) |
| `6c50e12d7` | merge #1324 (old head) onto e2e-tests-coverage, conflicts resolved |
| `9e4315a2b` | local bigname in the stack; e2e helpers; migration specs → `serveV1Names`; v1-subgraph-shim Dockerfile fix |
| `dc85fd291` | portal harness B0 check reads manager `config.ts`; lint; bigname mock also matches `:5660` |
| `5aaf664d3` | merge #1324 head `6e619f764` (brings main + squashed #1290); clean |

Integration decisions in the first #1324 merge (keep them if you re-merge):
- `e2e/helpers/mock-indexer.ts` serves **both** bigname REST (manager) and the
  Panoptes GraphQL ops the portal still uses (`getRegistryOccupants`,
  `getSubregistryUpdateCount`, `setRegistryOccupants`, `setSubregistryHistory`).
- `e2e/helpers/mock-v1-subgraph.ts` is **kept** (#1324 deletes it): the portal
  still reads the V1 subgraph.
- Manager: `v1SubgraphClient.ts`, the `/indexer` and `/v1-subgraph` Vite proxies,
  `env.d.ts` and the `VITE_V1_SUBGRAPH_URL` override in `src/lib/wagmi.ts` are gone.
  The two branch-only unit tests that imported the client now import
  `v1Names` / `v1ProfileKeys`.
- The branch's rewritten `migration*.spec.ts` (GW/GA/GR/GS/GM scenarios) were
  kept over #1324's edits to the old tests.

## The new stack

Everything is in `e2e/infra/` (read `e2e/infra/bigname/README.md` first).

- **Compose profile `bigname`** (six services): `bigname-postgres` (host 5661),
  `bigname-rpc`, `bigname-init`, `bigname-roles`, `bigname-runner`,
  `bigname-api` (**http://127.0.0.1:5660**).
- **Image `bigname:e2e-anvil-fork`** is built from local branch
  `e2e/anvil-fork-start` in `/Users/sg/ens/bigname` (3 commits on `main`
  `63db69039`, **not pushed**). All patches sit behind one dev flag,
  `BIGNAME_DEV_ALLOW_SEPOLIA_START=1`:
  - it lifts "Sepolia intake must start at block 0" (`apps/phase-runner/src/config.rs`,
    `main_manifests.rs`);
  - interpret logs and skips "activated migration boundary …" integrity errors,
    which real pre-fork Sepolia migrations hit
    (`crates/interpret/src/write/identity/transition.rs`).

  There is no cargo on the Mac. Rebuild with
  `docker build -t bigname:e2e-anvil-fork .` in `~/ens/bigname`; it takes about 20
  minutes cold and 3–5 minutes incremental.
- **`bigname/runner.sh`** reads Anvil's fork block (`anvil_nodeInfo`) and starts
  indexing from `BIGNAME_START`. The default is `fork`, meaning the fork block
  minus 2,064. `ensv2` (block 11,820,280) also works but backfills for an hour or
  more.
- **`bigname/fork-rpc.mjs`** (`bigname-rpc`) sits between the runner and the
  chain. Reads at or below the fork block go to the upstream Sepolia RPC; the rest
  go to Anvil. When the runner read through Anvil directly, its backfill wedged
  Anvil for every client (`eth_blockNumber` took more than 30s). Upstream batches
  are chunked to 10, with at most 6 in flight, and retried with backoff.
- **Anvil** now runs with `--slots-in-an-epoch 1024`, so safe = head − 1024 and
  finalized = head − 2048. bigname needs finalized ≥ its start block and treats a
  finalized block that goes backward as fatal.
- **Scripts:**
  - `start-local-env.sh` starts bigname when the image exists. It stores the fork
    block in `public.e2e_fork` and calls `reset-bigname.sh` when Anvil's fork
    block changes.
  - `reset-bigname.sh` wipes the volume, starts the services and waits; a new
    fork is live in about a minute.
  - `wait-for-bigname.sh` polls `/v1/status` `data.chains["11155111"].indexed_block`.
    Ignore `status`, which reads `degraded` when Anvil is idle.
- **v1-subgraph-shim:** its Dockerfile pinned pnpm `catalog:` versions that npm
  cannot install, so the image never built. It now builds.

## e2e code changes

- `e2e/helpers/bigname-sync.ts`: `isRealBigname`, `waitForBignameBlock`,
  `waitForBignameName(name, accept?)`, `waitForBignameNames`. All of them no-op in
  mock mode. `E2E_BIGNAME_URL` defaults to `:5660`.
- `e2e/helpers/v1-names.ts`: `serveV1Names(page, tree | flat)` replaces
  `mockV1Subgraph` in every **manager** migration spec.
  - Real mode: it waits until bigname serves every name.
  - Mock mode: it serves flat 2LDs through #1324's `mockV1Names`, and skips the
    test (`test.skip`) for subname trees and orphans.
  - The portal's `registration.spec.ts` still uses `mockV1Subgraph`.
- `fixtures/playwright.manager.fixture.ts`: in real mode `makeV2Name` waits for
  bigname to serve the name. In mock mode it calls `addName` as before.
- `specs/harness.spec.ts`: the B0 "pointed at this fork" check reads the
  manager's `/src/config.ts` as well as `/src/lib/wagmi.ts`. Before, it passed
  only because of the removed subgraph override.
- From #1324: `dashboard-names.spec.ts` (mock-only, skips in real mode).
  `seed-managed-name.ts` is deleted.

## Running it

```sh
cd /Users/sg/ens/apps-monorepo/.claude/worktrees/bigname-harness
bash e2e/infra/scripts/start-local-env.sh   # Anvil, Panoptes, funding, bigname
```

- **Fresh fork:** recreate Anvil, run
  `docker compose -f e2e/infra/docker-compose.yml rm -sf panoptes-indexer panoptes-api`,
  remove volume `infra_panoptes-data`, then run `start-local-env.sh`.
- **Dev servers:** the user's own servers hold 3000/3001 (main checkout, old
  setup). This worktree serves the **manager on 3010** and the **portal on 3011**.
  - The worktree's `e2e/.env` points at 3010/3011 and sets `E2E_MOCK_INDEXER=false`.
  - `apps/manager/.env.local` sets `VITE_BIGNAME_API_URL=http://127.0.0.1:5660`.

  These env files are local and uncommitted.
- **Port 3010 is currently in the user's manual-test mode**
  (`VITE_USE_MOCK_WALLET=true VITE_FF_USE_EOA=true`). Before running e2e, ask the
  user, then restart it plainly:
  `cd apps/manager && pnpm exec vite dev --port 3010 --strictPort`.
- **Full run:** I used a sequential runner that rebuilds the stack if Anvil dies
  (`/private/tmp/claude-501/-Users-sg-ens-apps-monorepo/0512f92d-0b97-4357-9d72-0743b1cb92e8/scratchpad/run-all.sh <outdir>`).
  Read the per-suite JSON `stats`. Grepping the line reporter for ✘ finds nothing.
- **Lint:** Biome ignores `.claude/worktrees`, so mirror the files into a
  scratch dir with `biome.jsonc` and a `.gitignore`.

## Results so far (first run, before `dc85fd291` and the #1324 refresh)

| Suite | Result | Cause |
|---|---|---|
| manager | 5 pass, 48 did not run | cold-fork Anvil tx timeout in a harness test |
| manager-migration | 8 pass, 31 FAIL | 30 × "bigname did not publish block": the stall below; 1 × GW3 locator timeout, **not investigated** |
| manager-premium | 4 skipped | by design in that config |
| portal | 14 pass, 482 did not run | B0 harness check, fixed in `dc85fd291` |
| cross-app | no tests found | nothing to run |
| metadata | 16 pass, 2 FAIL | known: PermissionedResolver `setText` revert, `/registry-hierarchy` 500, mainnet archive 403 |

Baseline from `e2e/coverage/handoff.md` iteration 31: `manager-migration` 40/40
twice, portal smoke 8/8. **No failure so far points at a #1324 or #1290
regression.** Unit tests on the merged branch: indexer 46, api-worker 245,
manager 3,192 pass. `csp.test.ts` fails **only** with the local `/rpc` env
override; it passes with the committed env.

Manual check by the user: `bgn1.eth`, registered on 3010, is served by local
bigname. The label came from the local tx `0x8d1b06d3…`, which does not exist on
public Sepolia.

## Open blocker: interpret stall on V1-fixture chains

```
surface binding a241ed8b-… is already bound to different identity data;
incoming: kind=declared_registry_path arm=ens_v1 block=11876893 source_event=NewOwner (ENSv1 registry 0x0000…0C2E…)
existing: same name/resource, block=11876892 source_event=LabelReserved (V2 ETH registry 0xd4eb…)
```

- Both blocks carry the **same timestamp** (10:59:12). The sequence comes from
  the V1 fixtures (`fixtures/makeV1Name.ts` reserves in V2 at line ~254, then
  writes the V1 registry), first hit in `harness-manager.spec.ts` "rule 6".
- It is **not** the `evm_revert`s: a fresh database fails on the same block.
- Unknown whether the trigger is the equal timestamps (the suite's clock control
  on Anvil, `fixtures/time.ts`) or the reserve-then-`NewOwner` order. To find out:
  1. Reproduce with `makeV1Name` alone on a fresh fork.
  2. Retry with a 1s timestamp gap between the two transactions.
  3. If it still fails, read how interpret derives the
     `declared_registry_path` surface-binding id.
- Then either fix the fixture (when real chains cannot produce the sequence) or
  add a dev patch to bigname. Draft a bigname issue for the user to review; do not
  file it.
- The runner then sits in a restart loop and `indexed_block` stops; every
  manager test after that times out in `waitForBignameBlock`. Recover with
  `reset-bigname.sh`.

## Known hazards

- **Anvil panics** with "historical state … is not available" (exit 133) about
  20–40 minutes into a fork: the public dRPC load balancer serves the read from a
  non-archive node. This existed before. Recreate Anvil and rerun
  `start-local-env.sh`. An archive `SEPOLIA_FORK_URL` would fix it.
- **Snapshot reverts deeper than 1,024 blocks** would stop bigname (finalized
  regression). Current reverts are shallow.
- **Pre-fork names are partial or missing** in local bigname (default start). Tests must
  create their own names, which they already do.
- **bigname writes no request logs.** Per-request counts are Prometheus at
  `127.0.0.1:9464` inside `bigname-api`.

## Next steps

1. Resolve the interpret stall above.
2. Restore 3010 to e2e mode, after asking the user.
3. Re-run all suites in real mode, then the manager suites in CI mode
   (`E2E_MOCK_INDEXER=true`). The mock now matches `:5660`, so the same dev
   server works.
4. Look at the GW3 locator timeout.
5. Update `e2e/coverage/handoff.md`, `e2e/README.md`, `e2e/docs/e2e-build-goal.md`
   and `.claude/skills/pr-verify/SKILL.md` for the bigname stack (still
   Panoptes-only today), and add the stall to `e2e/docs/e2e-defects.md`.
6. Ask the user before pushing `e2e/bigname-harness` or the bigname branch, and
   before merging into `e2e-tests-coverage`.
