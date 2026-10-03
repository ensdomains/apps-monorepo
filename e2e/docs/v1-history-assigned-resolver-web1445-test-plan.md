# WEB-1445: V1 name history only shows the assigned resolver, QA test plan and report

PR: [#1210 fix(portal): only show resolver events from the name's assigned resolver](https://github.com/ensdomains/apps-monorepo/pull/1210)
Report: Immunefi #91441
App: **portal** (`apps/portal`, `:3001`)
Spec: `e2e/projects/portal/tests/history.spec.ts` (`V1 name history shows only the assigned resolver (WEB-1445)`)

---

## 1. Change surface

The Explorer's V1 name history read resolver events from
`resolvers(where: { domain })`. The V1 subgraph creates a `Resolver` row for any
contract that emits a resolver-shaped event (`AddrChanged`, `TextChanged`, …)
with the node as a parameter. It never asks the registry whether that contract
is the name's resolver. So anyone could deploy a contract, emit
`AddrChanged(node, theirAddress)` or `TextChanged(node, "url", phishingUrl)`,
and the portal rendered "set address to …" or "set text record url → …" as the
name's own history. That covers the History page, the Overview's Recent
History, and the scoped history on the Resolver, Address Resolution and
Ownership pages.

| File | Role | Change |
|---|---|---|
| `history/v1/fetchV1NameHistory.ts` | reader | Reads the registry's `newResolvers(where: { domain })` first (up to 1000). Then it fetches resolver rows only for those ids (`resolvers(where: { id_in })`), so contracts nobody assigned can't crowd the real resolvers out of the query window. A second query, skipped when the name never had a resolver |
| `history/v1/fetchV1NameHistory.ts` | validator | New `assignedResolverFilter`: each `NewResolver` opens an interval for its resolver, and the next one (including an unset to `0x0`) closes it. A resolver event is kept only if its resolver held an interval containing the event's `(block, logIndex)`, parsed from the event id. Unparseable ids are dropped (fails closed) |
| `history/v1/fetchV1NameHistory.ts` | saturation | A full `newResolvers` window also counts as saturated ("history may be incomplete") |
| `history/v1/adaptV1Events.ts` | helper | `resolverAddress` exported for the filter |

What must still work: records set through the name's resolver, records on a
resolver the name has since moved off (written while it was assigned), and the
scoped (`eventTypes`) read that the Resolver and Address pages use.

---

## 2. Automated coverage

### How the forgery is produced

Two contracts nobody assigned are planted on the fork with `anvil_setCode`:
minimal emitters whose calldata is `topics ‖ data`, logged verbatim (`LOG2` for
`AddrChanged`, `LOG3` for `TextChanged`). A second account sends them a forged
`AddrChanged(node, 0xbad0…0bad)` and `TextChanged(node, "url", "https://phish-….example")`
for a freshly registered V1 name. Before asserting anything about the page,
each test checks that the subgraph really lists both forged rows under the
name, and that `newResolvers` names only the real resolver. So no "not shown"
assertion can pass because the forgery never landed.

`packages/v1-subgraph-shim` indexes every contract, as the real subgraph does,
so the forged rows arrive exactly as they would on Sepolia.

### Why the real records go through `0xE99638b4…`

The timeline drops a v1 event whose transaction the v2 feed (Panoptes) already
carries (`dropPagedDuplicates`). Local Panoptes indexes the default public
resolver `0x8FADE66B…` but not the older PublicResolver `0xE99638b4…`. A
record written through `0x8FADE66B…` would therefore render from Panoptes once
it caught up, and stop exercising the v1 read. So every legitimate record and
every positive control is written through `0xE99638b4…`, which the owner is
authorised on.

### e2e (real browser, real fork, real subgraph reads)

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | History: a contract nobody assigned can't write the name's history | The reported repro on `/$name/history`. The forged address and URL are absent. Positive controls: the owner's real `url` and `set address to 0xf39f…2266` (both from the assigned resolver) render, and there is no partial-load error | FAIL: forged URL and `0xbad0…0bad` both rendered | pass |
| 2 | Resolver page: the scoped history read drops the forged events too | `/$name/resolver` scopes the read to resolver event types, which takes the per-collection query (`textChangeds`, `addrChangeds`) instead of the `events` interface. Same forgeries absent, real `url` present | FAIL: both forgeries rendered | pass |
| 3 | History: records count only while their resolver was assigned | Owner-only writes through real PublicResolvers. A write on resolver B **before the name ever had a resolver**, **after the name moved off B**, and **after the resolver was unset** are all absent. Positive controls: B's first interval still renders after the name moved away and back, and the write after **re-assignment** renders | FAIL: all 3 stray writes rendered | pass |

Every negative is an `expect.soft`, so the pre-fix run reports each bug case
separately: 7 of 7 negatives failed on the reverted build.

The suite skips with the reason in its title when the shim is unreachable or
predates `newResolvers` / `resolverId`, which is the case in PR CI (see F2).

### Unit (vitest, `apps/portal`)

The PR adds 13 cases to `fetchV1NameHistory.test.ts`: `assignedResolverFilter`
interval edges (before assignment, after moving off, log-index order inside the
assigning block, mixed-case addresses, unset, no resolver ever, unparseable
ids), saturation on a full assignment window, and the fetch reading by `id_in`
with no unused variables on a scoped read. Those import the new export, so on
the pre-fix code the file fails to load rather than failing on an assertion. No
unit tests were added: the writer/reader contract is covered by the PR's tests
and end to end by the e2e above.

### Infrastructure changed to make this testable

`packages/v1-subgraph-shim` could not serve V1 name history at all, on either
build (F1). It now matches upstream on the four points the portal depends on,
each checked against `v1-graphql.ens.dev/subgraph`:

| Gap | Upstream | Shim before | Shim now |
|---|---|---|---|
| `resolverId` on `NewResolver` and resolver events | present | absent: every history query failed validation | present |
| top-level `newResolvers(where: { domain })` | present | absent | present |
| event ids | `[chainId-]block-logIndex` | `txHash-logIndex` (the PR's filter can't read a position from it, so it would drop every event) | `block-logIndex` |
| `Resolver_filter.id_in` type | `[String]` (no `ID` scalar exists) | `[ID!]`: rejected the portal's `[String!]!` variable | `[String!]` |

---

## 3. Results

On the PR build merged onto `e2e-tests-coverage`, with the patched shim:

- The 3 tests above pass (31 s)
- Unit: `apps/portal/src/features/history`: 125/125
- `pnpm typecheck` is clean in `apps/portal` and `e2e`. `biome check` is clean on the new spec. The shim's 1 typecheck error and 4 biome warnings already exist on the base
- `pnpm test:portal-smoke`: 13/14. The failure is the registration name-switch test (WEB-1464, F2 in `zero-price-checkout-web1485-test-plan.md`), which fails identically with this PR's files reverted

With the PR's 2 app files reverted to `e2e-tests-coverage`, all 3 tests fail on
the assertion that encodes the bug: forged rows rendered as the name's history,
and stray writes rendered outside their resolver's interval.

The PR's query shapes also run against the live Sepolia V1 endpoint:
`newResolvers { id resolverId }` returns ENSNode ids, and
`resolvers(where: { id_in: $ids })` with `$ids: [String!]!` is accepted.

---

## 4. Manual test plan

### Setup (local fork)

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
# the V1 subgraph stand-in, from the repo root (see F3 if it fails to start)
PORT=5656 RPC_URL=http://127.0.0.1:8545 node packages/v1-subgraph-shim/server/index.ts
cp apps/portal/.env.ci apps/portal/.env
pnpm --filter portal dev
```

Seed a V1 name with a record on a resolver Panoptes doesn't index, so the row
you see comes from the V1 read:

```sh
export RPC=http://127.0.0.1:8545
export OWNER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export ATTACKER_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
export REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
export RES_B=0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5
# register a V1 name owned by account 0 (any V1 registration works; the e2e
# fixture is createMakeV1Name in e2e/fixtures/makeV1Name.ts)
export NAME=<your-v1-name>.eth NODE=$(cast namehash $NAME)
cast send --rpc-url $RPC --private-key $OWNER_PK $REGISTRY "setResolver(bytes32,address)" $NODE $RES_B
cast send --rpc-url $RPC --private-key $OWNER_PK $RES_B "setText(bytes32,string,string)" $NODE url https://legit.example
```

Forge events from a contract nobody assigned. This deploys a 22-byte emitter
(it works on Sepolia too, with a funded key and `--rpc-url` pointed there):

```sh
EMITTER=$(cast send --rpc-url $RPC --private-key $ATTACKER_PK --json \
  --create 0x601680600b6000396000f36040360380604060003760203590600035906000a200 | jq -r .contractAddress)
TOPIC=$(cast keccak "AddrChanged(bytes32,address)")
DATA=$(cast abi-encode "f(address)" 0xbad0000000000000000000000000000000000bad)
cast send --rpc-url $RPC --private-key $ATTACKER_PK $EMITTER "${TOPIC}${NODE#0x}${DATA#0x}"
```

### Steps

| # | Steps | Pass |
|---|---|---|
| M1 | Open `/<name>/history`, disconnected | `set text record url → https://legit.example` shows. **No** `set address to 0xbad0…0bad`. No red "Couldn't load all of this name's history" banner |
| M2 | Open `/<name>/resolver` | Its History section shows the `url` row and no `0xbad0…0bad` |
| M3 | Open `/<name>` (overview) | Recent History shows no `0xbad0…0bad` |
| M4 | Open Address Resolution for the name and expand ETH | The resolution history shows no `0xbad0…0bad` |
| M5 | Connect a wallet and repeat M1 | Same result. History doesn't depend on the viewer |
| M6 | `setResolver` the name to `0x8FADE66B79cC9f707aB26799354482EB93a5B7dD`, then `setText` on `$RES_B` again (url → `https://stale.example`) | `https://stale.example` does **not** appear. `https://legit.example` (written while B was assigned) still does |
| M7 | **Sepolia:** a name with real history (e.g. one that changed resolver) | All records set on each resolver while it was assigned still appear. Nothing reads "Couldn't load all of this name's history" |
| M8 | **Sepolia:** deploy the emitter above and forge `AddrChanged` for a name you own | The forged row does not appear in the Explorer's history for that name |

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | Medium (test infra, fixed here) | `packages/v1-subgraph-shim` couldn't serve V1 name history on any build: the portal's history query failed validation (no `resolverId`), so the History page showed only Panoptes rows and the partial-load banner. Fixed on this branch on the four points in §2. Note that the fix changes the shim's event ids to `block-logIndex`, which is what upstream and the portal's `parseEventLogIndex` expect |
| F2 | Medium (CI gap) | PR CI (`.github/workflows/e2e.yml`) starts `anvil alto paymaster mockestrator` and not `v1-subgraph`. So `history.spec.ts` skips in CI and can't be a `@smoke` test. Adding the service (and fixing F3 so its image builds) would let it run |
| F3 | Low (pre-existing, already noted as F3 in `zero-price-checkout-web1485-test-plan.md`) | The lockfile's entry for the shim pins ensjs `4fc0c2a4` while the catalog is `fe19830b`. A fresh `pnpm install --frozen-lockfile` (even `--force`) leaves the shim's `@ensdomains/ensjs` link dangling, so it exits with `ERR_MODULE_NOT_FOUND`. Worked around locally by linking the catalog build. The four V1 contract addresses it reads are the same in both |
| F4 | Low (PR behaviour, by design) | The filter fails closed. A subgraph whose event ids don't end in `block-logIndex` would have every resolver event silently dropped, with no error or banner. The live endpoint matches today |
| F5 | Info (pre-existing) | Timeline rows that share a timestamp can render out of chain order (seen on the fork, where several blocks share one second), and unsetting the resolver renders as "updated resolver to resolver 0x0000…0000". Both builds behave the same |
| F6 | Info (open question) | Local Panoptes indexes only known resolvers, so the forged events never reach the v2 feed here. Whether production's v2 indexer accepts resolver events from arbitrary contracts wasn't checked, and it is outside this PR |
