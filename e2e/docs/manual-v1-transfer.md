# Manual V1 transfer testing (WEB-1396)

Hand-driven walkthrough of the V1 name transfer flow added by
[PR #1134](https://github.com/ensdomains/apps-monorepo/pull/1134). Shadows
`e2e/projects/portal/tests/transfer.spec.ts` (`Portal name transfer —
unmigrated V1 names`), and exists because the automated suite cannot judge
whether the *copy* reads correctly — which is most of what this PR adds.

**Written to be run from the browser alone**, including by a browser agent. Every
name is created by clicking in the ENS dev-tools drawer; nothing here needs a
terminal once the stack is up. (There is a CLI equivalent,
`pnpm --filter @ens-apps/e2e seed:v1-transfer`, if you happen to have a shell —
but the drawer is the primary path.)

## What a V1 transfer actually is

A V1 name holds ownership in **two places**, and this is the whole reason the
feature is more than a button:

| Contract | Holds | Called the |
|---|---|---|
| `BaseRegistrar` | the ERC-721 token | **registrant** / owner |
| `ENSRegistry` | who may set records | **controller** / manager |

They can be different accounts. A complete transfer moves **both** —
`reclaim` first, then `safeTransferFrom`. Move only the token and you have
handed over the asset while the old owner keeps the ability to repoint the
resolver and rewrite every record.

The order is not incidental. Once the ERC-721 moves, the sender is no longer
the registrant and can no longer `reclaim`, so the controller slot would be
stranded. #1134 does the controller first.

## Two consequences worth internalising

Each looks like a bug the first time you hit it.

1. **"You manage this name but don't own it" is a refusal, not an error.** You
   are the controller; someone else holds the registrant. Only the registrant
   can transfer. Moving the manager role alone would let the owner take it
   straight back — which is what the second paragraph of that card says.
2. **A grace-period name refuses transfer even though you still own it.** It is
   not a permissions problem; the name simply is not transferable until renewed.

## Setup

> **Check out a branch that contains #1134.** `e2e-tests-coverage` holds the
> tests but not the feature. Confirm with:
> `git ls-files apps/portal/src/features/transfer/v1/rules.ts` — it must print
> a path.

```bash
pnpm e2e:infra:up
```

Then start the portal with the dev tools and the mock wallet. **Set these in
`apps/portal/.env`** — not on the command line:

```
VITE_MIGRATION_TOOL=1
VITE_USE_MOCK_WALLET=true
```

> Vite reads `import.meta.env.VITE_*` from `.env` files, and a value **in the
> file wins over the same key in your shell**. `apps/portal/.env` already ships
> `VITE_USE_MOCK_WALLET=false`, so `VITE_USE_MOCK_WALLET=true pnpm dev` is
> silently ignored. Measured — it cost an hour of confusion.
>
> `.env.local` also works, but it is read by **every** portal dev server on the
> machine, so it will break a concurrent Playwright run. `pnpm e2e:portal`
> needs `VITE_USE_MOCK_WALLET=false`: the mock wallet auto-connects and removes
> the Connect button the suite waits for.

```bash
pnpm --filter portal dev     # :3001
```

The mock wallet connects you as Anvil account 0 with no prompts and no signing
dialogs, which is what makes this clickable.

## Creating the names — all from the drawer

Open **ENS Dev tools** (bottom-right, `aria-label="Open ENS dev tools"`). The
drawer opens on whichever tab you last used — often **Time travel** — so click
**Migration ›** in the drawer header first. The preset strip is grouped
`MIGRATE · COPY · TRANSFER · INELIGIBLE`.

Click a preset chip → wait for the name to appear in the row below → press
**Open** to land on that name's **Ownership** tab.

**Open** deliberately stops at the Ownership tab rather than jumping to the
transfer route. Whether that tab offers a Transfer link is part of what you are
checking — a link that leads to a refusal, or a missing link on a transferable
name, is the shape **E2E-001** was about. The dev tools' job is to get you to
the name; the app's job is everything after that.

| Preset | Family | Produces | Transfer link? | What to check |
|---|---|---|---|---|
| **Unwrapped** | migrate | you hold both halves | **yes** | the recipient form; the plan is `reclaim` → `transfer-erc721` |
| **Owner not mgr** | transfer | you keep the ERC-721, account 2 holds the controller | **yes** | transfer is *allowed*, but **no record options** appear — and after transferring, the manager has been reclaimed onto the recipient, not left with account 2 |
| **Manager only** | transfer | account 1 holds the ERC-721, you hold the controller | **no** | "You manage this name but don't own it", naming the registrant in full |
| **Wrapped** | migrate | NameWrapper ERC-1155, you | **yes** | **one** step (`transfer-erc1155`); the legacy registry owner stays the NameWrapper throughout |
| **Locked -xfer** | ineligible | wrapped, `CANNOT_TRANSFER` burnt | **no** | "Transfer permanently disabled" |
| **Grace Period** | migrate | expired ~45 days ago | **no** | "This name is in its grace period" |
| **Subname** | migrate | wrapped subname under a wrapped parent | **yes** | one `transfer-erc1155`; the **parent's** token must not move |
| **Emancipated** | migrate | subname with `PARENT_CANNOT_CONTROL` | **yes** | transfers, and **no** parent-reclaim warning — the parent genuinely retains nothing |

For the rows marked **no**, the link is *correctly* absent, so there is nothing
to click. **Its absence is the first assertion.** To read the card underneath,
append `/transfer` to the URL by hand — deep-linking is the only way in, which
is the point.

The pair worth doing together is **Owner not mgr** and **Manager only**. They
are mirrors — token without manager, manager without token — and only one of
them is transferable. Which one, and why, is the whole model:

- the **registrar** asks who the *registrant* is, so the token holder transfers;
- the **resolver** asks who the *controller* is, so only the manager writes
  records — which is why "Owner not mgr" is offered no record options at all;
- `reclaim` is what closes the gap, pulling the manager back so the recipient
  ends up with both.

**Manager only** is the case with no V2 analogue and the one most worth reading
carefully. It is created by registering normally and then handing the ERC-721
to account 1 — `BaseRegistrar.safeTransferFrom` alone, which pointedly does not
touch the registry. That is exactly why `reclaim` exists as a separate call.

## Walkthrough — the transferable case

1. Click **Unwrapped**, wait for the name, press **Open**.
2. On the Ownership tab, there should be a **Transfer** link — click it. Before
   #1134 that link never appeared for a V1 name at all, which is the single
   most direct way to confirm you are testing the right build.
3. The recipient form renders.
4. Paste any other address — account 1 is
   `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`.
5. Start the flow. The plan should be **two** steps, in this order:
   **reclaim**, then **transfer-erc721**. If you see only one, that is a
   finding — read "What a V1 transfer actually is" above.
6. Verify both halves moved. In the browser console:

```js
// registrant — BaseRegistrar.ownerOf
await window.ethereum.request({ method: 'eth_call', params: [{
  to: '<BaseRegistrar>', data: '<ownerOf(tokenId)>' }, 'latest'] })
```

Or, if you have a shell, the seeder prints ready-made `cast` commands:

```bash
SHAPE=ok pnpm --filter @ens-apps/e2e seed:v1-transfer
```

Both reads must return the recipient. If only the registrant moved, the old
owner still controls the records.

## Reading the refusal cards

For each of **Manager only**, **Locked -xfer** and **Grace Period**:

1. Press **Open** and confirm the Ownership tab shows **no Transfer link**.
   An entry point that contradicts its destination is the **E2E-001** shape,
   and it is worth checking every time.

   > For **Manager only**, the Ownership tab currently says "Name not
   > registered" rather than showing the split. That is **V1-F3**, already
   > recorded — the name is registered, and the transfer route identifies it
   > correctly. Do not re-file it; carry on to step 2.
2. Append `/transfer` to the URL to reach the card directly.
3. Check the **title** matches the table above, and that there is **no
   recipient form**.

For **Manager only** specifically, the card must print the registrant's
**full** address (font-mono), not a truncated one. The card exists to tell you
who to go and ask.

## Subnames moved by their parent (#1144)

> Needs a branch containing **#1144** as well as #1134. Check with
> `git grep -n "set-subnode-owner" apps/portal/src` — it must print matches.
> Without it the six presets below still seed correctly, but every one reads
> "Not authorized".

Everything above moves a name as its **holder**. #1144 adds a second actor:
the **parent's owner**, who can `setSubnodeOwner` a subname out from under
whoever holds it. The holder signs nothing and loses the name, which is why
this path is mostly warnings and refusals.

Each preset below leaves **you** (account 0) holding the parent and somebody
else holding the child. **Open** lands on the **subname**, not the 2LD — the
2LD exists only to be its parent. The chip's hover title is the oracle.

| Preset | Produces | Transfer link? | What to check |
|---|---|---|---|
| **Reassign wrapped** | wrapped 2LD (you) + wrapped subname (account 1) | **yes** | a warning *"You're reassigning this subname as the owner of …. Its current owner (0x7099…79C8) loses it the moment this lands"*; **no** record options; the modal has **one** step, *Reassign subname*. Afterwards the subname's fuses and expiry are unchanged |
| **Reassign registry** | unwrapped 2LD (you) + registry-only subname (account 1) | **yes** | same, through the legacy registry. Before #1144 this exact name read "Not authorized" |
| **Reassign -PCC** | locked 2LD (you) + subname with `PARENT_CANNOT_CONTROL` (account 1) | **no** | "This subname is out of the parent's control" — **E2E-013**: its last line sends you to the Subnames page, which cannot create V1 subnames. Already filed; don't re-file |
| **Reassign ≠wrap** | wrapped 2LD (you) + subname unwrapped onto account 1 | **no** | "Can't reassign this subname from here" — reassigning across the wrapper line would force-wrap it |
| **Parent reg only** | unwrapped 2LD whose ERC-721 you keep but whose controller is account 2, + subname (account 1) | **no** | "Reclaim the parent first" — **E2E-012**: the Ownership page it sends you to has no reclaim control. Already filed |
| **Reassign grace** | wrapped 2LD (you) pushed **30 days into grace**, + `other-` (account 1) and `held-` (you) | `other-`: **no** · `held-`: **yes** | `other-…`: *should* be "*2LD* is in its grace period" with a **Go to** button — **today it reads "Not authorized"**, which is **E2E-014** (already filed; don't re-file). `held-…` (edit the URL's first label): the form, plus a warning that whoever registers the 2LD next can take the subname back |

**Reassign grace moves the shared chain clock ~13 months.** Seed it **last**,
after everything else you want to look at — every name on the fork ages with
it. The rest of the family does not touch the clock.

### Walkthrough — the parent reassigns

1. Click **Reassign registry**, wait for the name, press **Open**. You land on
   `sub-….….eth/ownership`.
2. There is a **Transfer** link, even though the Owner row shows account 1 —
   that mismatch is the point: you are offered the move *as the parent*.
3. Click it. Read the yellow warning: it must name **your** parent name and
   account 1's address (truncated), and say the holder loses it.
4. Confirm there are **no** switches for the ETH address or the resolver. A
   parent holds neither slot on the subname, so any such option would send a
   write that reverts.
5. Enter account 2 (`0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`) and press
   **Transfer name**. The modal must show exactly **one** step, *Reassign
   subname*. Two or more is a finding.
6. After it lands, reload the Ownership tab: the Owner row reads account 2.

Also worth one look while you are there: send it to **yourself** (account 0).
That is "take it back" — the most common reason a parent does this — and it
must be allowed.

### Reproducing E2E-014 by hand

**The defect:** the owner of a wrapped `.eth` 2LD that is in its grace period
opens a subname they don't hold. The portal says **"Not authorized"** and
tells them they aren't the owner, when they are. It should show #1144's
**"*2LD* is in its grace period"** card with a **Go to *2LD*** button to renew.
The move is correctly refused either way (the NameWrapper would revert); what's
wrong is the reason and the missing way out.

Automated: `pnpm e2e:portal --grep "E2E-014"`. Register:
[`e2e-defects.md`](./e2e-defects.md) → E2E-014.

**Before you start:** this preset moves the shared chain clock forward about
13 months, and every name on the fork ages with it. Do it **last**, or reset
afterwards (see step 8).

1. On a branch containing #1144, with the portal on `:3001` as in [Setup](#setup),
   open the **ENS Dev tools** drawer → **Migration ›**.
2. In the **TRANSFER** group, click **Reassign grace**. Wait for the name to
   appear in the row below. It creates:
   - a wrapped 2LD owned by **you** (account 0), registered for a year, then
     pushed **30 days into its grace period**;
   - `other-<label>.<label>.eth`, held by **account 1** (you are only its parent);
   - `held-<label>.<label>.eth`, held by **you**.
3. Press **Open**. You land on `other-….eth/ownership`.
4. **No Transfer link** is correct: the wrapper refuses the parent's move
   during grace, so the link must not appear. Not a finding.
5. Append `/transfer` to the URL.
   - **Expected:** a card titled **"*2LD* is in its grace period"** saying the
     Name Wrapper refuses parent changes while it is in grace, with a
     **Go to *2LD*** button.
   - **Actual (E2E-014):** **"Not authorized — You are not the owner of this
     name. Only the current owner, or the owner of *2LD*, can move it."**
     The *2LD* it names is the one you own.
6. **Confirm it's the parent read, not the grace detection.** Change the URL's
   first label from `other-` to `held-` and reload `/transfer`. You should see
   the transfer form **plus** a warning that *2LD* is in its grace period. So
   the app knows the 2LD is in grace, and knows you are account 0. It only
   misreads **who owns the parent**.
7. *(Optional, needs a shell.)* Show the NameWrapper still says you own the 2LD:

   ```bash
   cast call "$(node --input-type=module -e "import {ensL1Contracts,supportedL1Chains} from '@ensdomains/ensjs/chain'; console.log(ensL1Contracts[supportedL1Chains.sepolia].ensNameWrapper.address)")" \
     "ownerOf(uint256)(address)" "$(cast namehash <label>.eth)" --rpc-url http://127.0.0.1:8545
   ```

   Run it from `e2e/`. It prints account 0,
   `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`.
8. **Reset the clock** when done: `pnpm e2e:infra:down && pnpm e2e:infra:up`,
   then allow ~30 minutes for Panoptes to backfill before trusting anything
   indexer-backed.

**Why it happens** (for the ticket): in grace, `BaseRegistrar.ownerOf` reverts.
ensjs `getOwner` then falls into its "expired 2LD" branch and returns
`{ registrant: null, owner: <registry owner>, ownershipLevel: 'registrar' }`.
For a wrapped 2LD the registry owner is the **NameWrapper contract**, so #1144's
`deriveParent` records an *unwrapped* parent held by the NameWrapper, and the
gate falls through to "Not authorized". The PR's unit test passes because it
builds the parent state by hand instead of from ensjs's shape.

### Two reads that are not the parent path

- **You hold the subname *and* own the parent** (the plain **Subname** and
  **Emancipated** presets): you are treated as the **holder** — one
  `transfer-erc1155`, no reassign warning. The holder path wins when you are
  both.
- A **refusal card's last line is part of what you are testing.** E2E-012 and
  E2E-013 are both about cards whose instruction cannot be followed. For each
  card, try to do what it says.


## When something does not appear

Work down this list before assuming an app bug.

1. **Are you on a branch with #1134?** No V1 name will offer transfer without
   it. See Setup.
2. **Is the drawer there at all?** It renders only when at least one of
   `VITE_MIGRATION_TOOL` / `VITE_TIME_TRAVEL` / `VITE_DQA` is set — and set in
   `.env`, not the shell.
3. **Are you Anvil account 0?** The panel's subgraph injection is
   address-scoped, and the gate outcome depends on who you are. The header
   shows the connected address.
4. **Does the name say "not registered"?** Check the chain clock. A long QA
   session accumulates forward time travel — 142 days on one measured run —
   and eventually names read as expired or unregistered. Reset with
   `pnpm e2e:infra:down && pnpm e2e:infra:up`, then allow ~30 minutes for
   Panoptes to backfill before trusting anything indexer-backed.
5. **Is this the migrated-name classification question?** A *migrated* locked
   name classifies as ENSv1 and renders the V1 card. That is V1-F1 in the plan,
   already recorded — not a new finding.

## Related

- [`transfer-v1-web1396-test-plan.md`](./transfer-v1-web1396-test-plan.md) —
  the QA plan and results, including what is automated and what is not.
- [`transfer-v1-subname-web1407-test-plan.md`](./transfer-v1-subname-web1407-test-plan.md) —
  the same for #1144's parent-initiated subname moves (F30, F34–F40).
- `e2e/projects/portal/tests/transfer.spec.ts` — the automated version. Run
  with `pnpm e2e:portal --grep "@scenario:F23|@scenario:F24|@scenario:F25"`.
- [`manual-subname-transfer.md`](./manual-subname-transfer.md) — the sibling
  walkthrough for #1120's subname transfer.
