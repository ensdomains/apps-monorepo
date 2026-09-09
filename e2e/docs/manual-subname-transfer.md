# Manual subname transfer testing (WEB-128)

Hand-driven walkthrough of the V2 subname transfer flow added by
[PR #1120](https://github.com/ensdomains/apps-monorepo/pull/1120). It shadows
`e2e/projects/portal/tests/transfer.spec.ts` — every shape below has a
`@scenario:F##` twin there, named in the tables — and exists because the
automated suite cannot tell you whether the *copy* reads correctly, which is
most of what this PR adds.

## What subname transfer actually is

A subname is **not** a name in the `.eth` registry. Its token lives in the
parent's **subregistry**, a `UserRegistry` proxy the parent owner deployed and
pointed their own `subregistry` slot at. So a subname transfer touches a
different contract than every transfer that came before it, and three separate
registries are in play on one screen:

| read | which registry | which resource |
|---|---|---|
| the subname's owner, resolver, expiry | the **parent's subregistry** | the subname's label |
| "can the parent reclaim / re-issue it" | the **parent's subregistry** | the subname's label, and **ROOT `0`** |
| "can the parent repoint the registry" | the **`.eth` registry** | the **parent's** label |

Before #1120 the portal simply refused: both `/$name/ownership` and
`/$name/ownership/transfer` gated on `is2LD(name)`. That was always a UI gate
only — the chain permitted it the whole time.

## Three consequences worth internalising

Each of these looks like a bug the first time you hit it.

1. **A zero expiry reads as _expired_, not _never expires_.** The registry has
   no never-expires sentinel and returns `0` for a label it holds no entry for,
   and the route mirrors `_isExpired` with `<=`. So a read against the *wrong*
   registry is indistinguishable from a genuinely lapsed name — both render
   "This subname has expired". Note the manager disagrees: `profileExpiry.ts`
   treats a zero v2 expiry as non-expiring.
2. **An inherited resolver offers no detach option, and that is correct.**
   `getOwnResolver` reads the subname's own registry slot, so a subname that
   merely inherits its parent's resolver shows neither "Detach the resolver"
   nor "Set the ETH address to the recipient". Before #1120 both appeared: the
   detach was a no-op write, and the ETH-address write targeted the *parent's*
   resolver — a contract the sender usually isn't authorised on, so it reverted
   mid-plan.
3. **No warning can mean two different things.** If the parent owner holds none
   of the three powers you get no alert; if the parent owner cannot be resolved
   at all, the role queries are disabled and you *also* get no alert. Only the
   error variant ("We couldn't check what its owner can still do to it")
   distinguishes them. Silence is not confirmation of safety.

## Setup

```bash
pnpm e2e:infra:up

cd apps/portal
VITE_USE_MOCK_WALLET=true VITE_TIME_TRAVEL=1 pnpm dev   # :3001
```

> `VITE_USE_MOCK_WALLET` takes the string `true` exactly — `1` does not work.
> It auto-connects you as Anvil account #0 with no prompts and no signing
> dialogs, which is what makes this walkthrough clickable. It is also
> **mutually exclusive with the Playwright suite**: it removes the Connect
> button `connectWithHeadlessWallet` waits for, so `pnpm e2e:portal` times out
> while it is on. Set it back to `false` before running the suite.

Then seed the shapes:

```bash
pnpm --filter @ens-apps/e2e seed:subname-transfer              # all four
SHAPE=all-powers pnpm --filter @ens-apps/e2e seed:subname-transfer   # just one
```

Each shape prints its name, the registries involved, what the chain says, an
`expect:` block, and the URL to open. The `expect:` lines are read off the
chain at seed time — if the app disagrees with one, that is a finding, not a
stale doc.

For the whole ground-truth table at once, without the QA framing:

```bash
pnpm --filter @ens-apps/e2e probe:subname-transfer
```

## The shapes

| Shape | What it seeds | Expect | Twin |
|---|---|---|---|
| `all-powers` | parent owner holds all three powers; resolver inherited | Transfer offered; warning lists **three** powers joined `a; b; and c`; says `(you)`; **no** detach options | `F16` |
| `separate-owners` | subname owned by `user2`, parent by you | as the default account: "Not authorized". Switch `VITE_MOCK_ACCOUNT` to `user2` to get the form and the non-self closer | `F16` |
| `own-resolver` | subname has a resolver of its **own** | **both** detach options appear; after transferring, the subname's resolver clears and the parent's is unchanged | `F19` (mirror) |
| `no-transfer-role` | subname owned by `user3` **without** `ROLE_CAN_TRANSFER_ADMIN` | as the default account: "Not authorized". As `user3`: "Transfer not available", no form | `F21` |

The owner in `no-transfer-role` is deliberately **not** the account that
deployed the subregistry. `hasRoles` resolves
`roles[ROOT][account] | roles[resource][account]`, so the deployer holds every
role at the registry root and withholding one on the subname's own resource
would read as no withholding at all.

## Walkthrough — `all-powers`

```bash
SHAPE=all-powers pnpm --filter @ens-apps/e2e seed:subname-transfer
```

1. Open the printed `/…/ownership` URL. There should be a **Transfer** button —
   before #1120 there was none.
2. Follow it. The recipient form renders. The old card ("Transferring subnames
   isn't supported yet") must be gone.
3. Read the second alert, under the irreversibility one. It should name the
   parent and read as one sentence:

   > This is a subname of **parent.eth**, and its owner (you) keeps authority
   > over it — they can take it back at any time, without waiting for it to
   > expire; issue it to someone else once it expires; and point **parent.eth**
   > at a different registry, which stops this name resolving no matter who
   > owns it. This transfer isn't final the way transferring **parent.eth**
   > itself would be.

   Check the joiners specifically: two semicolons and an `; and ` before the
   last power. A missing clause means a role read came back false — check it
   against the seeder's output before assuming it is a copy bug.
4. Paste the `user2` address as recipient. **No** detach switches should appear
   (the resolver is inherited). Wait for **Transfer name** to enable — it stays
   disabled until both the detach reads and the parent-authority reads settle.
5. Transfer, then verify on chain:

```bash
SUBREG=<subname registry from the seeder>       # the parent's subregistry
cast call $SUBREG "getResolver(string)(address)" sub          # 0x0 — inherited, untouched
cast call $SUBREG "getExpiry(uint256)" $(cast keccak sub)     # unchanged
cast call $ETH_REGISTRY "getResolver(string)(address)" <parentLabel>   # unchanged
```

The last one is the point: transferring a subname must never touch the
parent's resolver.

## Reproducing E2E-010 by hand

The one confirmed portal defect in this PR. `useTransferName` re-reads the
name's **own** resolver just before the `set-eth-addr` step runs, specifically
to catch the state having changed since the form was drawn, and throws if it is
gone. That guard cannot fire: `apps/portal/src/utils/queryClient.ts` sets a
global `staleTime` of one hour, so the re-read is served from cache and never
touches the chain.

```bash
SHAPE=stale-resolver pnpm --filter @ens-apps/e2e seed:subname-transfer
```

That shape is the only one that gives the subname **both** its own resolver and
an `addr(60)` — the two conditions that make the app offer "Set the ETH address
to the recipient" at all. It prints numbered steps with the commands already
filled in; the shape of it is:

1. Open the printed URL, paste any other address as the recipient.
2. Turn **off** "Detach the resolver". `set-eth-addr` is only planned when the
   resolver is being *kept*, so leaving it on removes the step you are testing.
3. Wait for **Transfer name** to enable — but do not press it.
4. In a second terminal, clear the resolver out from under the open page:
   `NAME=<the name> pnpm --filter @ens-apps/e2e clear-own-resolver`
5. **Without reloading**, press **Transfer name** → **Start** → **Open wallet**
   for each step. A reload re-reads the chain and the bug disappears, which is
   itself the tell.

**What you should see:** "Update ETH address" turns green. That is the defect —
by the time it ran, the name had no resolver of its own, and the code is
written to refuse. Confirm the precondition genuinely held with the `cast`
command the seeder prints; it must return the zero address.

**What you should not over-read.** In this shape the record is not lost: the
subname's own slot and its parent's held the same contract, so once the own
slot is cleared the name inherits its way back to the very resolver that was
written, and `addr(60)` still resolves. The harm is latent, and becomes real
when the two resolvers differ — the ordinary case, and the one `getOwnResolver`
exists to distinguish. The register says the same thing; do not report it as
data loss.

Automated equivalent: `pnpm e2e:portal --grep "E2E-010"`. It fails by design —
it asserts the oracle, like the F5 and F14 defect tests.

## Making a subname expire

The expiry gate compares a chain timestamp against the **browser's** clock, so
warping Anvil alone is not enough — the UI would still think it is now.

1. Seed any shape and note its expiry from the printout.
2. Open the **Dev Tools** drawer → **Time travel** → **+30d** until you are
   past it. That control moves Anvil *and* the browser clock together and then
   reloads.
3. The transfer route should show **This subname has expired**, with no
   recipient form and a note to ask the parent's owner to renew.

Seed the expired case **last**: a forward warp moves the single shared chain
clock for every name on the fork, so anything seeded earlier ages with it.

## When something does not appear

Work down this list before assuming an app bug.

1. **Is the Dev Tools drawer there at all?** It renders only when at least one
   of `VITE_TIME_TRAVEL` / `VITE_MIGRATION_TOOL` / `VITE_DQA` is set. No flag,
   no drawer, no error.
2. **Are you the account you think you are?** The header shows the connected
   address. `all-powers` and `own-resolver` want account #0; `separate-owners`
   and `no-transfer-role` need `VITE_MOCK_ACCOUNT` switched and the dev server
   restarted. "Not authorized" almost always means this.
3. **Did you wait?** The roles panel reads on-chain logs since #1131 and takes
   up to ~30s on a local fork. The transfer form's button is disabled until its
   reads settle. Neither is a hang.
4. **Is the parent's subregistry actually deployed?** A subname cannot exist
   without one; the seeder prints the address it used.
5. **Is this the known shared-registry misattribution?** If a subname shows up
   under the *wrong* parent, that is **E2E-007**, already filed. Don't re-file.
6. **Is Anvil still healthy?** A long session can leave it slow enough to time
   things out. `docker compose -f e2e/infra/docker-compose.yml ps` and, if in
   doubt, `pnpm e2e:infra:down && pnpm e2e:infra:up`.

## Feeding findings back

With `VITE_DQA=1` and `VITE_DQA_URL=http://localhost:4000` (the `dqa` service
is already running after `pnpm e2e:infra:up`) you can pin comments to elements
on the live page and push them to Linear from the drawer. See
[`dqa-overlay.md`](./dqa-overlay.md).

## Related

- `e2e/projects/portal/tests/transfer.spec.ts` — the automated version of this
  walkthrough. Run with
  `pnpm e2e:portal projects/portal/tests/transfer.spec.ts`, or one shape with
  `pnpm e2e:portal --grep "@scenario:F19"`.
- `e2e/scripts/probe-subname-transfer.ts` — the measured ground truth behind
  the scenario oracles.
- [`transfer-web446-test-plan.md`](./transfer-web446-test-plan.md) — the 2LD
  transfer plan this extends; its finding F4 is the note that predicted this PR.
- [`e2e-defects.md`](./e2e-defects.md) — E2E-001/002/003 are all transfer
  defects; check there before filing.
