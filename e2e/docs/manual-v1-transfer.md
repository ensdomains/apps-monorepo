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
- `e2e/projects/portal/tests/transfer.spec.ts` — the automated version. Run
  with `pnpm e2e:portal --grep "@scenario:F23|@scenario:F24|@scenario:F25"`.
- [`manual-subname-transfer.md`](./manual-subname-transfer.md) — the sibling
  walkthrough for #1120's subname transfer.
