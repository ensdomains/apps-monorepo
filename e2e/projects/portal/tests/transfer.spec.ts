import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getAddressRecord } from '@ensdomains/ensjs/public'
import { getOwner, hasRoles } from '@ensdomains/ensjs/public/v2'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { setRecords } from '@ensdomains/ensjs/wallet/v1'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2'
import {
  type Web3ProviderBackend,
  Web3RequestKind,
} from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import {
  type Address,
  createWalletClient,
  encodeFunctionData,
  type Hash,
  http,
  labelhash,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { withChainSnapshot } from '../../../fixtures/chain-snapshot.js'
import {
  registerSubname as createSubname,
  attachSubregistry as deployAndAttachSubregistry,
  FULL_ROLE_BITMAP,
} from '../../../fixtures/makeSubname.js'
import {
  createMakeV1Name,
  FUSES,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import { CHILD_FUSES, makeV1Subname } from '../../../fixtures/makeV1Subname.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'
import { waitForIndexedRegistry } from '../../../helpers/indexer-sync.js'
import {
  authorizeTransaction,
  switchWalletToSepolia,
  switchWalletToUndeclaredChain,
} from '../../../helpers/portal-auth.js'
import {
  assertLacksRoles,
  assertRoleBitmap,
  grantNameRoles,
  readNameRoles,
} from '../../../helpers/role-assertions.js'
import {
  driveTransactionsToSuccess,
  transferTxId,
} from '../../../helpers/transaction-modal.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'

// Same chain contracts `makeName` reads from — see e2e/fixtures/makeName.ts.
const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]
const ETH_REGISTRY = ensjsSepolia.ensRegistry.address

/** `0xabcd…1234` — how the UI renders an address in a row or card. */
const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`

/** A wallet client for `ownerPrivateKey`, pointed at the local Anvil fork. */
function getOwnerClient(ownerPrivateKey: Hash) {
  return createWalletClient({
    account: privateKeyToAccount(ownerPrivateKey),
    chain: walletClient.chain!,
    transport: http(ANVIL_RPC_URL),
  })
}

/**
 * Reads `label`'s current resolver and subregistry directly from the `.eth`
 * registry — used to snapshot state before a transfer and confirm it's
 * unchanged after.
 */
/**
 * On-chain owner of a 2LD in the `.eth` registry.
 *
 * Goes through `getOwner` (`UniversalResolver.findOwner`, name-keyed) rather
 * than a precomputed `ownerOf(labelToCanonicalId(label))`: the registry bumps
 * the token's low-order version bits on at least some registry-level writes
 * (grantRoles, confirmed by probe — see F8's comment), which makes a
 * statically-computed token id go stale and read back as unowned even though
 * the name has a real owner. Name-keyed resolution can't go stale this way.
 */
function ownerOfName(label: string): Promise<Address> {
  return getOwner(publicClient as never, {
    name: `${label}.eth`,
  }) as Promise<Address>
}

function readResolverAndSubregistry(
  label: string,
): Promise<[Address, Address]> {
  return Promise.all([
    publicClient.readContract({
      address: ETH_REGISTRY,
      abi: permissionedRegistryGetResolverSnippet,
      functionName: 'getResolver',
      args: [label],
    }),
    publicClient.readContract({
      address: ETH_REGISTRY,
      abi: permissionedRegistryGetSubregistrySnippet,
      functionName: 'getSubregistry',
      args: [label],
    }),
  ])
}

/**
 * Confirms `ownerAddress` is shown as the owner on both the name's Overview
 * tab (`/$name`) and Ownership tab (`/$name/ownership`) — both labeled
 * "Owner" (they share the same `Owner` component; see WEB-649).
 */
async function expectOwnerOnNamePages(
  page: Page,
  name: string,
  ownerAddress: string,
): Promise<void> {
  const shortenedOwner = `${ownerAddress.slice(0, 6)}…${ownerAddress.slice(-4)}`

  // Chain first. Everything below this line is the *app's rendering* of
  // ownership, and §4's first hard rule is that rendering is not evidence the
  // token moved — "the page says Owner: 0xabc" is the example it gives. This
  // helper was text-only, which left F1's central postcondition resting on a
  // string, with `ownerOfName` sitting unused in this same file. Added by the
  // §6 B4 audit; see docs/e2e-spec-audit.md.
  expect(
    (await ownerOfName(name.replace(/\.eth$/, ''))).toLowerCase(),
    `the .eth registry does not report ${ownerAddress} as the owner of ${name} — the UI may still be rendering the pre-transfer owner`,
  ).toBe(ownerAddress.toLowerCase())

  await page.goto(`${PORTAL_APP_URL}/${name}`)
  await expect(page.getByText('Owner', { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText(shortenedOwner).first()).toBeVisible({
    timeout: 15_000,
  })

  await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
  await expect(page.getByText('Owner', { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText(shortenedOwner).first()).toBeVisible({
    timeout: 15_000,
  })
}

/**
 * Whether `account` holds `role` on `label` in the `.eth` registry — the same
 * `hasRoles` read the app's `useCanTransferName` / `useHasRoles` perform.
 */
function ownerHasRole(
  label: string,
  role:
    | 'ROLE_CAN_TRANSFER_ADMIN'
    | 'ROLE_SET_SUBREGISTRY'
    | 'ROLE_SET_RESOLVER',
  account: Address,
): Promise<boolean> {
  return hasRoles(
    publicClient as never,
    {
      registryAddress: ETH_REGISTRY,
      label,
      roles: [role],
      account,
    } as never,
  ) as Promise<boolean>
}

/**
 * Role bit positions, as the registry packs them. Only the ones the subname
 * scenarios withhold; everything else goes through `assertRoleBitmap` and the
 * named `Role` strings.
 */
const ROLE_BIT = { canTransferAdmin: 28n } as const

/**
 * A full bitmap minus one role.
 *
 * Clears the whole **nybble** (`0xF`), not a single bit, because V2 packs a
 * count into each one — and clears the admin counterpart 128 bits higher too.
 * Masking only the admin half leaves the role itself set and `hasRoles` still
 * answers true, which is precisely how the first draft of the F21 scenario
 * silently tested nothing.
 */
const withoutRole = (bitmap: bigint, shift: bigint): bigint =>
  bitmap & ~(0xfn << shift) & ~(0xfn << (shift + 128n))

/** Write `addr(60)` on `name`'s resolver, signed by `ownerPrivateKey`. */
async function setEthAddressRecord(
  name: string,
  resolverAddress: Address,
  value: Address,
  ownerPrivateKey: Hash,
): Promise<void> {
  const hash = await setRecords(getOwnerClient(ownerPrivateKey), {
    name,
    resolverAddress,
    coins: [{ coin: 60, value }],
  })
  await publicClient.waitForTransactionReceipt({ hash })
}

test.describe('Portal name transfer', () => {
  test('transfers a name from wallet A to wallet B, and wallet B is shown as the owner', {
    tag: ['@scenario:F10', '@smoke'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(180_000)

    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({ label: 'test1-a-to-b', owner: 'user' })
    const recipient = accounts.getAddress('user2')

    // ── 1. Start the transfer from the Ownership tab ─────────────────
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    await page.getByRole('link', { name: 'Transfer' }).click()
    await expect(
      page.getByRole('heading', { name: 'Transfer ownership' }),
    ).toBeVisible({ timeout: 15_000 })

    // ── 2. Fill the recipient and submit ──────────────────────────────
    await page.getByPlaceholder('ENS name or address').fill(recipient)
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()

    // ── 3. Authorize the on-chain transfer ────────────────────────────
    // A name fresh from `makeName` always has a resolver attached (the
    // shared V1_PUBLIC_RESOLVER), and SendNameForm's "Detach the resolver"
    // option defaults to on whenever a resolver is set — so even this
    // hands-off transfer detaches it before the token moves (see
    // buildTransferPlan.ts).
    await driveTransactionsToSuccess(page, wallet, [
      `transfer-${name}-detach-resolver`,
      `transfer-${name}-transfer-token`,
    ])
    await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
      timeout: 30_000,
    })

    // ── 4. Confirm wallet B is now the owner ──────────────────────────
    await expectOwnerOnNamePages(page, name, recipient)
  })

  test('transfers a name to wallet B with the resolver detached', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
    test.setTimeout(180_000)

    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'test2-detach-resolver',
      owner: 'user',
    })
    const recipient = accounts.getAddress('user2')

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByRole('heading', { name: 'Transfer ownership' }),
    ).toBeVisible({ timeout: 15_000 })

    await page.getByPlaceholder('ENS name or address').fill(recipient)

    // "Detach the resolver" defaults to on whenever the name has one, so a
    // name fresh from `makeName` shows it pre-checked — nothing to toggle.
    await expect(
      page.getByRole('switch', { name: /Detach the resolver/ }),
    ).toBeChecked({ timeout: 15_000 })

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()

    // Detaching the resolver adds a step that must run before the token
    // transfer (see buildTransferPlan.ts — the sender loses the roles
    // needed to detach the resolver once the ERC-1155 token has moved).
    await driveTransactionsToSuccess(page, wallet, [
      `transfer-${name}-detach-resolver`,
      `transfer-${name}-transfer-token`,
    ])
    await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
      timeout: 30_000,
    })

    await expectOwnerOnNamePages(page, name, recipient)

    // The resolver pointer was detached as part of the transfer, so it now
    // shows as unset until the new owner configures their own.
    await page.goto(`${PORTAL_APP_URL}/${name}/resolver`)
    await expect(
      page.getByText('This name does not have a resolver set.'),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('transfers a name from wallet A to an ENS name owned by wallet B', {
    tag: ['@scenario:F10'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(180_000)

    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'transfer-to-ens-name',
      owner: 'user',
    })
    const recipientName = await makeName({
      label: 'test3-recipient',
      owner: 'user2',
    })
    const recipientAddress = accounts.getAddress('user2')

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByRole('heading', { name: 'Transfer ownership' }),
    ).toBeVisible({ timeout: 15_000 })

    // Enter the recipient's ENS name rather than a raw address.
    await page.getByPlaceholder('ENS name or address').fill(recipientName)

    // Wait for it to resolve to wallet B's address before submitting.
    await expect(page.getByText(recipientAddress)).toBeVisible({
      timeout: 15_000,
    })

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()

    // See "transfers a name from wallet A to wallet B" — a fresh name always
    // has a resolver attached, so it's detached by default here too.
    await driveTransactionsToSuccess(page, wallet, [
      `transfer-${name}-detach-resolver`,
      `transfer-${name}-transfer-token`,
    ])
    await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
      timeout: 30_000,
    })

    await expectOwnerOnNamePages(page, name, recipientAddress)
  })

  test('cannot transfer a name to its own address or its own ENS name', {
    tag: ['@scenario:F10'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(120_000)

    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({ label: 'test4-self-guard', owner: 'user' })
    const ownAddress = accounts.getAddress('user')

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByRole('heading', { name: 'Transfer ownership' }),
    ).toBeVisible({ timeout: 15_000 })

    const recipientInput = page.getByPlaceholder('ENS name or address')
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    const selfOwnedMessage = page.getByText(
      'The recipient already owns this name.',
    )

    // Own address
    await recipientInput.fill(ownAddress)
    await expect(selfOwnedMessage).toBeVisible({ timeout: 15_000 })
    await expect(transferButton).toBeDisabled()

    // Own ENS name — the name being transferred still resolves to the
    // connected wallet, so it exercises the same self-transfer guard.
    await recipientInput.fill(name)
    await expect(selfOwnedMessage).toBeVisible({ timeout: 15_000 })
    await expect(transferButton).toBeDisabled()
  })

  test('cannot transfer to an invalid or unresolvable recipient', {
    tag: ['@scenario:F10'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    test.setTimeout(120_000)

    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'test6-invalid-recipient',
      owner: 'user',
    })

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByRole('heading', { name: 'Transfer ownership' }),
    ).toBeVisible({ timeout: 15_000 })

    const recipientInput = page.getByPlaceholder('ENS name or address')
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    const invalidMessage = page.getByText('Enter a valid ENS name or address')

    // Single-label text — no TLD and not a 0x address, so it fails
    // isNameOrAddress's syntactic check outright (see
    // useAddressResolution.ts / isNameOrAddress.ts).
    await recipientInput.fill('notaname')
    await expect(invalidMessage).toBeVisible({ timeout: 15_000 })
    await expect(transferButton).toBeDisabled()

    // Malformed address — too short to pass viem's `isAddress`, and still no
    // dot, so it hits the same syntactic-invalid path.
    await recipientInput.fill('0x1234')
    await expect(invalidMessage).toBeVisible({ timeout: 15_000 })
    await expect(transferButton).toBeDisabled()

    // Syntactically valid `.eth` name, but unregistered — passes the
    // isNameOrAddress check, then fails to resolve to any address, landing
    // on the distinct "unresolved" message instead of "invalid".
    const unresolvedName = `this-name-does-not-exist-${Date.now()}.eth`
    await recipientInput.fill(unresolvedName)
    await expect(
      page.getByText(`Could not resolve an address for “${unresolvedName}”`),
    ).toBeVisible({ timeout: 15_000 })
    await expect(transferButton).toBeDisabled()
  })

  test('lets the new owner edit records after a transfer', {
    tag: ['@scenario:F11'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(180_000)

    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({ label: 'test5-then-edit', owner: 'user' })
    const newOwner = accounts.getAddress('user2')

    // ── 1. Transfer from wallet A to wallet B ─────────────────────────
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(newOwner)
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()
    // A fresh name always has a resolver attached, so it's detached by
    // default as part of the transfer — the new owner starts with none.
    await driveTransactionsToSuccess(page, wallet, [
      `transfer-${name}-detach-resolver`,
      `transfer-${name}-transfer-token`,
    ])
    await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
      timeout: 30_000,
    })

    // ── 2. Reconnect the headless wallet as the new owner ─────────────
    // WalletMenu truncates as `truncateAddress(address, 5, 3)` (e.g.
    // "0x709…9C8") — matching on the raw address's middle characters (as the
    // old assertion did) can never appear in that truncated string.
    await wallet.changeAccounts([accounts.getPrivateKey('user2')])
    await expect(
      page.getByRole('button', {
        name: new RegExp(`Wallet menu for.*${newOwner.slice(-3)}`, 'i'),
      }),
    ).toBeVisible({ timeout: 15_000 })

    // ── 3. New owner deploys their own resolver ────────────────────────
    // The transfer above detached the resolver by default (step 1), and
    // resolver write-permissions are a static role grant that stays with
    // whoever held them at deploy time anyway — they don't follow the
    // ERC-1155 token transfer. Either way the new owner has to deploy a
    // fresh resolver before they can write records.
    await page.goto(`${PORTAL_APP_URL}/${name}/change-resolver`)
    await page.getByRole('switch', { name: /Use custom resolver/ }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await driveTransactionsToSuccess(page, wallet, [
      'tx-deploy-permissioned-resolver',
      'tx-change-resolver',
    ])
    await expect(
      page.getByRole('button', { name: 'Resolver changed!' }),
    ).toBeVisible({ timeout: 30_000 })

    // ── 4. New owner adds and saves a text record ──────────────────────
    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    await page.getByLabel('Type').selectOption('text')
    await page.getByLabel('Key').fill('description')
    await page.getByLabel('Value').fill('Edited by the new owner')
    await page.getByRole('button', { name: 'Add record' }).click()
    await page.getByRole('button', { name: /Save \d+ change/ }).click()
    await driveTransactionsToSuccess(page, wallet, ['tx-save-resolver-records'])

    await expect(page).toHaveURL(new RegExp(`/${name}/records$`), {
      timeout: 30_000,
    })
    // Chain read-back, not the rendered value: F11's oracle is that the new
    // owner can *write*, and a rendered string only proves the form echoed it.
    // Added by the §6 B4 audit — same fault class as F1's ownership check.
    //
    // Read `text()` straight off the resolver the registry reports, rather than
    // through ensjs's `getTextRecord`: that helper resolves via the Universal
    // Resolver and throws for the freshly deployed resolver this test creates.
    // Verified by hand against a name from an earlier run — the direct read
    // returns the value while the helper throws, so the record does land and
    // the helper was the wrong instrument. Going direct is also the higher
    // oracle: it depends on nothing but the two contracts under assertion.
    const [resolverForRecords] = await readResolverAndSubregistry(
      name.replace(/\.eth$/, ''),
    )
    const written = await publicClient.readContract({
      address: resolverForRecords,
      abi: parseAbi(['function text(bytes32,string) view returns (string)']),
      functionName: 'text',
      args: [namehash(name), 'description'],
    })
    expect(
      written,
      'the record the new owner saved is not readable from the resolver on chain — the transfer left them unable to actually write',
    ).toBe('Edited by the new owner')

    await expect(page.getByText('Edited by the new owner')).toBeVisible({
      timeout: 15_000,
    })
  })

  test('keeps the resolver and registry attached when both detach options are turned off', {
    tag: ['@scenario:F9'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(180_000)

    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'test7-keep-attached',
      owner: 'user',
    })
    const label = name.replace(/\.eth$/, '')
    const recipient = accounts.getAddress('user2')

    // Attach a subregistry on-chain so "Detach the registry" actually
    // renders (see useTransferDetachTargets.ts — it's hidden otherwise).
    const subregistryAddress = await deployAndAttachSubregistry(
      { label: name.replace(/\.eth$/, '') },
      privateKeyToAccount(accounts.getPrivateKey('user')),
    )
    const [originalResolver, originalSubregistry] =
      await readResolverAndSubregistry(label)
    expect(originalSubregistry.toLowerCase()).toBe(
      subregistryAddress.toLowerCase(),
    )

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByRole('heading', { name: 'Transfer ownership' }),
    ).toBeVisible({ timeout: 15_000 })

    await page.getByPlaceholder('ENS name or address').fill(recipient)

    // The resolver option still defaults on whenever it has a target — turn
    // it off to exercise the "leave everything as-is" path. The registry
    // option now defaults OFF (SendNameForm's OPTIONS/useState — #1170, fixes
    // immunefi #93026: a routine transfer must not silently detach a
    // subregistry other people's subnames depend on), so it's already in the
    // state this test wants and needs no click — just confirm that.
    const detachResolverSwitch = page.getByRole('switch', {
      name: /Detach the resolver/,
    })
    const detachRegistrySwitch = page.getByRole('switch', {
      name: /Detach the registry/,
    })
    await expect(detachResolverSwitch).toBeVisible({ timeout: 15_000 })
    await detachResolverSwitch.click()
    await expect(detachRegistrySwitch).toBeVisible({ timeout: 15_000 })
    await expect(detachRegistrySwitch).not.toBeChecked()

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()

    // With both detach options off, buildTransferPlan.ts collapses the plan
    // to the bare token transfer.
    await driveTransactionsToSuccess(page, wallet, [
      `transfer-${name}-transfer-token`,
    ])
    await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
      timeout: 30_000,
    })

    await expectOwnerOnNamePages(page, name, recipient)

    // Neither the resolver nor the registry were detached, so both should
    // still point at exactly what they did before the transfer.
    const [resolverAfter, subregistryAfter] =
      await readResolverAndSubregistry(label)
    expect(resolverAfter.toLowerCase()).toBe(originalResolver.toLowerCase())
    expect(subregistryAfter.toLowerCase()).toBe(
      originalSubregistry.toLowerCase(),
    )
  })

  /**
   * The gate this test was written against is **gone** (WEB-128 / #1120).
   *
   * Until then both surfaces gated on `is2LD(name)` — false for anything
   * deeper than `label.eth` — and the route rendered "Transferring subnames
   * isn't supported yet". That was only ever a client-side gate: a subname
   * owner holding ROLE_CAN_TRANSFER_ADMIN could always move the ERC-1155
   * token directly on-chain, which an earlier revision of this test did
   * successfully. #1120 removes the gate and adds real machinery in its place
   * (parent-authority warning, expiry check, own-vs-inherited resolver), each
   * covered by its own case in the "subnames" describe block below.
   *
   * F3's oracle changed with it: the catalogue previously specified "assert
   * the explicit unsupported copy; flip when support lands". This is that
   * flip, so this test now asserts the entry points are OFFERED. The removed
   * copy is asserted absent too — a half-reverted gate that hides the link
   * but leaves the route working (or vice versa) is exactly the regression
   * worth catching, and neither assertion alone would catch it.
   */
  test('offers transfer for a subname', {
    tag: ['@scenario:F3'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(180_000)

    await connectWithHeadlessWallet(page, wallet)

    const parentName = await makeName({
      label: 'test8-subname-parent',
      owner: 'user',
    })

    // A subname only exists once its parent has a subregistry — same setup as
    // the "registry attached" scenario above — then register the subname
    // itself as a label inside it.
    const subregistryAddress = await deployAndAttachSubregistry(
      { label: parentName.replace(/\.eth$/, '') },
      privateKeyToAccount(accounts.getPrivateKey('user')),
    )
    await createSubname(
      {
        registryAddress: subregistryAddress,
        label: 'sub',
        parentLabel: parentName.replace(/\.eth$/, ''),
      },
      privateKeyToAccount(accounts.getPrivateKey('user')),
    )
    const name = `sub.${parentName}`

    // ── 1. The Ownership tab offers the entry point ───────────────────
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    await expect(page.getByRole('heading', { name: 'Ownership' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      page.getByRole('link', { name: 'Transfer' }),
      'a subname whose owner holds ROLE_CAN_TRANSFER_ADMIN must be offered the Transfer link',
    ).toBeVisible({ timeout: 30_000 })

    // ── 2. ...and the route renders the form, not the old refusal ─────
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByPlaceholder('ENS name or address'),
      'the transfer route must render the recipient form for a subname',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByText(/Transferring subnames isn’t supported yet/),
      'the pre-#1120 refusal copy must be gone (curly apostrophe — it is a literal in the removed MessageCard)',
    ).toBeHidden()
    await expect(page.getByText('Transfer not available')).toBeHidden()

    // ── 3. The parent (a 2LD) is unaffected and still transferable ────
    await page.goto(`${PORTAL_APP_URL}/${parentName}/ownership`)
    await expect(page.getByRole('link', { name: 'Transfer' })).toBeVisible({
      timeout: 30_000,
    })
  })

  test('repoints the ETH address at the recipient when the resolver is kept', {
    tag: ['@scenario:F12', '@scenario:F9'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(240_000)

    await connectWithHeadlessWallet(page, wallet)

    // A dedicated resolver proxy (deployed because `records` is non-empty) is
    // required — the shared V1_PUBLIC_RESOLVER doesn't grant this owner write
    // access, and `set-eth-addr` writes through the resolver, not the registry.
    const name = await makeName({
      label: 'test9-set-eth-addr',
      owner: 'user',
      records: [{ key: 'description', value: 'seed' }],
    })
    const label = name.replace(/\.eth$/, '')
    const owner = accounts.getAddress('user')
    const recipient = accounts.getAddress('user2')

    const [resolverAddress] = await readResolverAndSubregistry(label)
    await setEthAddressRecord(
      name,
      resolverAddress,
      owner,
      accounts.getPrivateKey('user'),
    )

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    const setEthAddressSwitch = page.getByRole('switch', {
      name: /Set the ETH address to the recipient/,
    })
    const detachResolverSwitch = page.getByRole('switch', {
      name: /Detach the resolver/,
    })

    // The option only renders once `addr(60)` is set, and starts disabled
    // because detaching the resolver makes it redundant (see SendNameForm).
    await expect(setEthAddressSwitch).toBeVisible({ timeout: 30_000 })
    await expect(setEthAddressSwitch).toBeDisabled()
    await expect(
      page.getByText('Not needed while the resolver is being detached.'),
    ).toBeVisible()

    // Keep the resolver → the ETH-address repoint becomes live and, per
    // buildTransferPlan, contributes a `set-eth-addr` step before the token.
    await detachResolverSwitch.click()
    await expect(setEthAddressSwitch).toBeEnabled()
    await expect(setEthAddressSwitch).toBeChecked()

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()

    await driveTransactionsToSuccess(page, wallet, [
      `transfer-${name}-set-eth-addr`,
      `transfer-${name}-transfer-token`,
    ])
    await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
      timeout: 30_000,
    })

    await expectOwnerOnNamePages(page, name, recipient)

    // The resolver was kept, and `addr(60)` now points at the recipient rather
    // than the sender — so the sender can no longer claim it as a primary name.
    const [resolverAfter] = await readResolverAndSubregistry(label)
    expect(resolverAfter.toLowerCase()).toBe(resolverAddress.toLowerCase())
    const ethAddress = await getAddressRecord(publicClient as never, {
      name,
      coin: 60,
    })
    expect(ethAddress?.value?.toLowerCase()).toBe(recipient.toLowerCase())
  })

  /**
   * F9 — the remaining detach-toggle combinations.
   *
   * `buildTransferPlan.ts` exposes exactly 3 booleans (setEthAddress,
   * detachResolver, detachRegistry), so 2³ = 8 raw combinations — but
   * `SendNameForm` disables `setEthAddress` whenever `detachResolver` is on,
   * and `buildTransferPlan` independently ignores it there too, so those two
   * rows are UI-unreachable duplicates of each other. That leaves 6 distinct,
   * reachable plans. Three are already covered above and by F1/F7 (both
   * default-on with no registry target, and the T,F,F row via F12); these
   * three close the remaining rows — see coverage/handoff.md, iteration 15.
   */
  /**
   * These two rows attach an empty subregistry purely to exercise the detach
   * toggle — they don't care about real subname counts. Mock
   * `getRegistryOccupants` instead of waiting on Panoptes to discover the
   * freshly-deployed subregistry (see the `mockIndexer` fixture and
   * `mock-indexer.ts` — Panoptes' CREATE2-discovery for new subregistries is
   * currently stuck, so the real query hangs indefinitely on a fresh one).
   */
  test.describe('registry-detach toggle rows (mocked occupant count)', () => {
    test.use({ mockIndexerEnabled: true })

    test('detaches the registry alone when the resolver is explicitly kept', {
      tag: ['@scenario:F9'],
    }, async ({
      portalPage: page,
      wallet,
      accounts,
      makeName,
      mockIndexer,
    }) => {
      test.setTimeout(180_000)

      await connectWithHeadlessWallet(page, wallet)

      const name = await makeName({
        label: 'test-f9-registry-only',
        owner: 'user',
      })
      const label = name.replace(/\.eth$/, '')
      const recipient = accounts.getAddress('user2')

      const subregistryAddress = await deployAndAttachSubregistry(
        { label },
        privateKeyToAccount(accounts.getPrivateKey('user')),
      )
      const [originalResolver] = await readResolverAndSubregistry(label)
      // Empty subregistry — no third parties, no consent tick required.
      mockIndexer.setRegistryOccupants(subregistryAddress, {
        count: 0,
        thirdPartyCount: 0,
      })

      await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
      await page.getByPlaceholder('ENS name or address').fill(recipient)

      // The resolver still defaults on whenever it has a target — keep it by
      // turning its switch off. The registry option now defaults OFF (#1170),
      // so turn it on explicitly. The subregistry here was just deployed with
      // no subnames in it, so flipping it on needs no consent tick — see
      // getDetachConsentState's zero-count case in SendNameForm.tsx.
      const detachResolverSwitch = page.getByRole('switch', {
        name: /Detach the resolver/,
      })
      const detachRegistrySwitch = page.getByRole('switch', {
        name: /Detach the registry/,
      })
      await expect(detachResolverSwitch).toBeVisible({ timeout: 15_000 })
      await detachResolverSwitch.click()
      await expect(detachRegistrySwitch).toBeVisible({ timeout: 15_000 })
      await expect(detachRegistrySwitch).not.toBeChecked()
      await detachRegistrySwitch.click()
      await expect(detachRegistrySwitch).toBeChecked()

      const transferButton = page.getByRole('button', {
        name: 'Transfer name',
      })
      await expect(transferButton).toBeEnabled({ timeout: 15_000 })
      await transferButton.click()

      await driveTransactionsToSuccess(page, wallet, [
        transferTxId(name, 'detach-registry'),
        transferTxId(name, 'transfer-token'),
      ])
      await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
        timeout: 30_000,
      })
      await expectOwnerOnNamePages(page, name, recipient)

      const [resolverAfter, subregistryAfter] =
        await readResolverAndSubregistry(label)
      expect(resolverAfter.toLowerCase()).toBe(originalResolver.toLowerCase())
      expect(subregistryAfter).toBe(zeroAddress)
      expect(subregistryAddress).not.toBe(zeroAddress)
    })

    test('updates the ETH address and detaches the registry when the resolver is kept', {
      tag: ['@scenario:F9'],
    }, async ({
      portalPage: page,
      wallet,
      accounts,
      makeName,
      mockIndexer,
    }) => {
      test.setTimeout(180_000)

      await connectWithHeadlessWallet(page, wallet)

      // Needs a dedicated resolver proxy (via `records`) for the same reason as
      // F12: the shared V1_PUBLIC_RESOLVER doesn't grant this owner write access,
      // and `set-eth-addr` writes through the resolver.
      const name = await makeName({
        label: 'test-f9-addr-and-registry',
        owner: 'user',
        records: [{ key: 'description', value: 'seed' }],
      })
      const label = name.replace(/\.eth$/, '')
      const owner = accounts.getAddress('user')
      const recipient = accounts.getAddress('user2')

      const [resolverAddress] = await readResolverAndSubregistry(label)
      await setEthAddressRecord(
        name,
        resolverAddress,
        owner,
        accounts.getPrivateKey('user'),
      )
      const subregistryAddress = await deployAndAttachSubregistry(
        { label },
        privateKeyToAccount(accounts.getPrivateKey('user')),
      )
      // Empty subregistry — no third parties, no consent tick required.
      mockIndexer.setRegistryOccupants(subregistryAddress, {
        count: 0,
        thirdPartyCount: 0,
      })

      await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
      await page.getByPlaceholder('ENS name or address').fill(recipient)

      const detachResolverSwitch = page.getByRole('switch', {
        name: /Detach the resolver/,
      })
      const setEthAddressSwitch = page.getByRole('switch', {
        name: /Set the ETH address to the recipient/,
      })
      const detachRegistrySwitch = page.getByRole('switch', {
        name: /Detach the registry/,
      })
      await expect(detachResolverSwitch).toBeVisible({ timeout: 15_000 })
      await detachResolverSwitch.click()
      // Freed by turning detachResolver off, and on by default once enabled.
      await expect(setEthAddressSwitch).toBeChecked()
      // The registry option now defaults OFF (#1170) — turn it on explicitly.
      // Empty subregistry (0 subnames), so no consent tick is required.
      await expect(detachRegistrySwitch).toBeVisible({ timeout: 15_000 })
      await expect(detachRegistrySwitch).not.toBeChecked()
      await detachRegistrySwitch.click()
      await expect(detachRegistrySwitch).toBeChecked()

      const transferButton = page.getByRole('button', {
        name: 'Transfer name',
      })
      await expect(transferButton).toBeEnabled({ timeout: 15_000 })
      await transferButton.click()

      await driveTransactionsToSuccess(page, wallet, [
        `transfer-${name}-set-eth-addr`,
        transferTxId(name, 'detach-registry'),
        transferTxId(name, 'transfer-token'),
      ])
      await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
        timeout: 30_000,
      })
      await expectOwnerOnNamePages(page, name, recipient)

      const [resolverAfter, subregistryAfter] =
        await readResolverAndSubregistry(label)
      expect(resolverAfter.toLowerCase()).toBe(resolverAddress.toLowerCase())
      expect(subregistryAfter).toBe(zeroAddress)
      const ethAddress = await getAddressRecord(publicClient as never, {
        name,
        coin: 60,
      })
      expect(ethAddress?.value?.toLowerCase()).toBe(recipient.toLowerCase())
    })
  })

  test('detaches both the resolver and the registry when the registry detach is explicitly turned on', {
    tag: ['@scenario:F9'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(180_000)

    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({ label: 'test-f9-both-detach', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    const recipient = accounts.getAddress('user2')

    const subregistryAddress = await deployAndAttachSubregistry(
      { label },
      privateKeyToAccount(accounts.getPrivateKey('user')),
    )
    // See waitForIndexedRegistry's header comment: a freshly attached
    // subregistry answers null (fail closed) until Panoptes discovers it.
    await waitForIndexedRegistry(subregistryAddress)

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    // The resolver switch still defaults on with a target present — leave it
    // untouched. The registry switch now defaults OFF (#1170), so it must be
    // turned on explicitly to exercise this row. The subregistry here is
    // freshly deployed with no subnames, so no consent tick is required.
    await expect(
      page.getByRole('switch', { name: /Detach the resolver/ }),
    ).toBeChecked()
    const detachRegistrySwitch = page.getByRole('switch', {
      name: /Detach the registry/,
    })
    await expect(detachRegistrySwitch).toBeVisible({ timeout: 15_000 })
    await expect(detachRegistrySwitch).not.toBeChecked()
    await detachRegistrySwitch.click()
    await expect(detachRegistrySwitch).toBeChecked()

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()

    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'detach-resolver'),
      transferTxId(name, 'detach-registry'),
      transferTxId(name, 'transfer-token'),
    ])
    await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
      timeout: 30_000,
    })
    await expectOwnerOnNamePages(page, name, recipient)

    const [resolverAfter, subregistryAfter] =
      await readResolverAndSubregistry(label)
    expect(resolverAfter).toBe(zeroAddress)
    expect(subregistryAfter).toBe(zeroAddress)
  })

  test.describe('registry-detach consent flow (mocked occupant / history counts)', () => {
    test.use({ mockIndexerEnabled: true })

    /**
     * F41 — the security fix itself (immunefi #93026 / WEB-1504 / #1170).
     *
     * Before this PR `detachRegistry` defaulted ON, so a routine transfer
     * could silently zero a name's subregistry pointer and stop every
     * subname under it from resolving — including subnames held by people
     * who are not party to the transfer, are never told, and hold no role
     * that lets them repair it. The fix: the toggle now defaults OFF, and
     * turning it on with something to lose requires an explicit, informed,
     * non-stale opt-in (`useRegistryDetachImpact` / `RegistryDetachConsent`
     * in `SendNameForm.tsx`).
     *
     * This one test covers both the consent gate and its "stale tick" guard.
     * It only needs the indexer to *report* a third-party count, not for
     * real subnames to exist — `getRegistryOccupants` is mocked directly
     * (`mockIndexer.setRegistryOccupants`), so this needs no on-chain
     * subname writes and no indexer backfill wait at all. The subregistry
     * itself is still deployed and attached for real, and the transfer's
     * `setSubregistry(0)` write at the end is still a real on-chain
     * transaction.
     */
    test('blocks detaching a registry with third-party subnames until the exact blast radius is acknowledged, and voids that acknowledgement if the toggle is reset', {
      tag: ['@scenario:F41', '@smoke'],
    }, async ({
      portalPage: page,
      wallet,
      accounts,
      makeName,
      mockIndexer,
    }) => {
      test.setTimeout(180_000)

      await connectWithHeadlessWallet(page, wallet)

      const recipient = accounts.getAddress('user2')
      const ownerAccount = privateKeyToAccount(accounts.getPrivateKey('user'))

      const name = await makeName({
        label: 'test-f41-third-party',
        owner: 'user',
      })
      const label = name.replace(/\.eth$/, '')

      const subregistryAddress = await deployAndAttachSubregistry(
        { label },
        ownerAccount,
      )
      // 2 subnames total, 1 of them not owned by the sender — the exact
      // blast radius the consent copy below asserts on. This mocks the
      // *count query response*, not on-chain state: no `createSubname`
      // writes or indexer backfill wait needed for this test's purpose.
      mockIndexer.setRegistryOccupants(subregistryAddress, {
        count: 2,
        thirdPartyCount: 1,
      })

      await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
      await page.getByPlaceholder('ENS name or address').fill(recipient)

      const detachRegistrySwitch = page.getByRole('switch', {
        name: /Detach the registry/,
      })
      await expect(detachRegistrySwitch).toBeVisible({ timeout: 15_000 })
      await expect(detachRegistrySwitch).not.toBeChecked()

      const transferButton = page.getByRole('button', {
        name: 'Transfer name',
      })
      await expect(transferButton).toBeEnabled({ timeout: 15_000 })

      // ── Turning the option on surfaces the real blast radius ──────────
      await detachRegistrySwitch.click()

      const consentCheckbox = page.getByRole('checkbox', {
        name: /I understand this breaks 2 subnames, including ones I don.t own/,
      })
      // `exact: true` — the checkbox label below also contains "2 subnames" as
      // a substring of a longer sentence, and would otherwise ambiguously match.
      await expect(
        page.getByText('2 subnames', { exact: true }),
        'the alert must name the real, indexer-counted subname count',
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        page.getByText(/Some of them belong to other people/),
        'a registry with a third-party subname must get the third-party wording, not the generic one',
      ).toBeVisible()
      await expect(
        transferButton,
        'the transfer must stay blocked until the destructive detach is acknowledged',
      ).toBeDisabled()

      // ── Ticking the box unblocks it ────────────────────────────────────
      await expect(consentCheckbox).toBeVisible()
      await consentCheckbox.click()
      await expect(transferButton).toBeEnabled({ timeout: 15_000 })

      // ── Resetting the toggle voids the tick (getDetachConsentKey) ──────
      await detachRegistrySwitch.click() // off
      await detachRegistrySwitch.click() // back on
      await expect(
        consentCheckbox,
        'turning the step off and on again must not carry the old tick forward',
      ).not.toBeChecked()
      await expect(
        transferButton,
        'a stale acknowledgement must not still satisfy the gate',
      ).toBeDisabled()

      // ── Re-ticking lets the real, on-chain detach go through ───────────
      await consentCheckbox.click()
      await expect(transferButton).toBeEnabled({ timeout: 15_000 })
      await transferButton.click()

      await driveTransactionsToSuccess(page, wallet, [
        transferTxId(name, 'detach-resolver'),
        transferTxId(name, 'detach-registry'),
        transferTxId(name, 'transfer-token'),
      ])
      await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
        timeout: 30_000,
      })
      await expectOwnerOnNamePages(page, name, recipient)

      // The write actually ran: `setSubregistry(0)` landed on chain — a real
      // detach, not just a UI-level one.
      const [, subregistryAfter] = await readResolverAndSubregistry(label)
      expect(subregistryAfter).toBe(zeroAddress)
      expect(subregistryAddress).not.toBe(zeroAddress)
    })

    /**
     * F42 — the `useSubregistrySlot` end-to-end path (companion PR #1170).
     *
     * A zeroed subregistry slot renders differently depending on whether it
     * was ever configured. Before this PR both read as "Configure registry",
     * which on a DETACHED name would let the current holder deploy a
     * brand-new, empty registry and re-mint a victim's old label into it,
     * stranding the original token. The unit tests already cover
     * `useSubregistrySlot` in isolation; this proves the real thing end to
     * end — a real detach transfer (the actual `setSubregistry(0)` write),
     * then a real page load whose `getSubregistryUpdateCount` response is
     * mocked instead of waiting for Panoptes to index the detach block.
     */
    test('shows "Registry detached" instead of "Configure registry" after a detach transfer', {
      tag: ['@scenario:F42', '@smoke'],
    }, async ({
      portalPage: page,
      wallet,
      accounts,
      makeName,
      mockIndexer,
    }) => {
      test.setTimeout(180_000)

      await connectWithHeadlessWallet(page, wallet)

      const recipient = accounts.getAddress('user2')
      const ownerAccount = privateKeyToAccount(accounts.getPrivateKey('user'))

      const name = await makeName({
        label: 'test-f42-detached-notice',
        owner: 'user',
      })
      const label = name.replace(/\.eth$/, '')

      const subregistryAddress = await deployAndAttachSubregistry(
        { label },
        ownerAccount,
      )
      // Empty subregistry — no third parties, no consent tick required.
      mockIndexer.setRegistryOccupants(subregistryAddress, {
        count: 0,
        thirdPartyCount: 0,
      })

      await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
      await page.getByPlaceholder('ENS name or address').fill(recipient)

      const detachRegistrySwitch = page.getByRole('switch', {
        name: /Detach the registry/,
      })
      await expect(detachRegistrySwitch).toBeVisible({ timeout: 15_000 })
      await detachRegistrySwitch.click() // empty registry — no consent required

      const transferButton = page.getByRole('button', {
        name: 'Transfer name',
      })
      await expect(transferButton).toBeEnabled({ timeout: 15_000 })
      await transferButton.click()

      await driveTransactionsToSuccess(page, wallet, [
        transferTxId(name, 'detach-resolver'),
        transferTxId(name, 'detach-registry'),
        transferTxId(name, 'transfer-token'),
      ])
      await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
        timeout: 30_000,
      })

      const [, subregistryAfter] = await readResolverAndSubregistry(label)
      expect(subregistryAfter).toBe(zeroAddress)

      // The detach transaction landed for real above; rather than waiting for
      // Panoptes to index the `SubregistryUpdated` event it emitted, mock
      // `getSubregistryUpdateCount`'s response directly so the next page load
      // reads "detached" deterministically.
      mockIndexer.setSubregistryHistory(namehash(name), 1)

      // Reconnect as the recipient — the new owner is exactly who a re-mint
      // attack would target, and exactly who must see the warning rather than
      // an invitation to configure a fresh registry.
      await wallet.changeAccounts([accounts.getPrivateKey('user2')])
      await page.goto(`${PORTAL_APP_URL}/${name}/registry`)

      await expect(
        page.getByText('Registry detached'),
        'a slot that was configured and now reads zero must show the detached notice',
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        page.getByText(
          /its subnames have stopped resolving.*still exist in the old registry/s,
        ),
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Configure registry' }),
        'offering a fresh registry here would let the holder re-mint the old labels and strand the original token',
      ).toBeHidden()
    })
  })

  /**
   * F8 — the V2 analogue of "sync manager": registry control (roles) and
   * token ownership are asserted separately. F7 already proves the sender's
   * *own* roles move with the token; this proves a manager who was never the
   * owner keeps their roles exactly as granted, untouched by a transfer that
   * has nothing to do with them.
   */
  test('leaves a third-party manager role grant untouched by a transfer', {
    tag: ['@scenario:F8'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(180_000)

    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'test-f8-manager-split',
      owner: 'user',
    })
    const label = name.replace(/\.eth$/, '')
    const recipient = accounts.getAddress('user2')
    const manager = accounts.getAddress('user3')

    await grantNameRoles(
      { label },
      manager,
      ['ROLE_SET_RESOLVER'],
      privateKeyToAccount(accounts.getPrivateKey('user')),
    )
    const managerRolesBefore = (await readNameRoles({ label }, manager)).decoded
    expect(managerRolesBefore).toContain('ROLE_SET_RESOLVER')

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()

    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'detach-resolver'),
      transferTxId(name, 'transfer-token'),
    ])
    await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
      timeout: 30_000,
    })
    await expectOwnerOnNamePages(page, name, recipient)

    // The token moved; the manager's independently-granted role did not.
    await assertRoleBitmap({ label }, manager, managerRolesBefore)
  })

  /**
   * F14 — interrupted after step 1 of N. Covers the same-session case: a
   * wallet prompt is rejected mid-flow, and the app must say what already
   * executed and let the user resume without redoing it. Cross-reload
   * persistence is a separate claim the app does not implement —
   * `useRecoveredTransactions` exists in `packages/transaction-manager` but
   * has no caller in `apps/portal/src` — recorded as a product gap in
   * `docs/e2e-defects.md` rather than asserted here.
   */
  test('shows what already executed and lets the user resume after a rejected step', {
    tag: ['@scenario:F14'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(300_000)

    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'test-f14-interrupted',
      owner: 'user',
    })
    const label = name.replace(/\.eth$/, '')
    const owner = accounts.getAddress('user')
    const recipient = accounts.getAddress('user2')

    const detachId = transferTxId(name, 'detach-resolver')
    const transferId = transferTxId(name, 'transfer-token')
    const successCount = new Map<string, number>()
    page.on('console', (msg) => {
      const text = msg.text()
      for (const id of [detachId, transferId]) {
        if (text.includes(`Transaction ${id} state: success`)) {
          successCount.set(id, (successCount.get(id) ?? 0) + 1)
        }
      }
    })

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()

    const dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog).toBeVisible({ timeout: 30_000 })

    // Reaches the next point where a wallet request can be triggered, then
    // triggers it — mirroring `driveTransactionsToSuccess`'s own two ways a
    // step becomes actionable: an explicit "Open wallet" button, or (for
    // every transaction but the last, which auto-starts — see that
    // function's comment) a "Waiting..." button with a clickable icon
    // button just before it. Stops right after triggering, before
    // authorizing, so the caller can choose authorize vs reject.
    const triggerWalletRequest = async (timeoutMs = 90_000) => {
      const deadline = Date.now() + timeoutMs
      const openWalletButton = dialog.getByRole('button', {
        name: /open wallet/i,
      })
      const waitingButton = dialog.getByRole('button', {
        name: /^Waiting\.\.\.$/i,
      })
      while (Date.now() < deadline) {
        if (await openWalletButton.isVisible().catch(() => false)) {
          await openWalletButton.click()
          return
        }
        if (await waitingButton.isVisible().catch(() => false)) {
          const iconWalletButton = waitingButton.locator(
            'xpath=preceding-sibling::button[1]',
          )
          if (await iconWalletButton.isVisible().catch(() => false)) {
            await iconWalletButton.click()
            return
          }
        } else {
          const primaryButton = dialog.getByRole('button', {
            name: /^(Start|Next)$/i,
          })
          if (
            (await primaryButton.isVisible().catch(() => false)) &&
            (await primaryButton.isEnabled().catch(() => false))
          ) {
            await primaryButton.click()
            continue
          }
        }
        await page.waitForTimeout(500)
      }
      throw new Error(
        `triggerWalletRequest: no wallet trigger appeared within ${timeoutMs}ms`,
      )
    }

    // ── Step 1 of 2 (detach-resolver): authorize normally ──────────────
    await triggerWalletRequest()
    await authorizeTransaction(wallet, 60_000)
    await expect
      .poll(() => successCount.get(detachId) ?? 0, { timeout: 30_000 })
      .toBe(1)

    // ── Step 2 of 2 (transfer-token): the wallet prompt is rejected ────
    await triggerWalletRequest()
    await expect
      .poll(
        () => wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
        {
          timeout: 15_000,
        },
      )
      .toBeGreaterThanOrEqual(1)
    await wallet.reject(Web3RequestKind.SendTransaction)

    // The interruption must be visible and recoverable, not a silent hang.
    // A rejected request bounces the dialog back to the step overview,
    // which is itself the "what already executed" surface: it lists both
    // steps with their real status rather than losing track of step 1.
    await expect(dialog.getByText('Detach resolver')).toBeVisible({
      timeout: 15_000,
    })
    await expect(dialog.getByText('Done', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Failed', { exact: true })).toBeVisible()
    const retryButton = dialog.getByRole('button', { name: 'Retry' })
    await expect(retryButton).toBeVisible()

    // Step 1's effect already landed and is durable; step 2 has not — the
    // interruption must not leave the name half-transferred.
    const [resolverAfterStep1] = await readResolverAndSubregistry(label)
    expect(resolverAfterStep1).toBe(zeroAddress)
    expect((await ownerOfName(label)).toLowerCase()).toBe(owner.toLowerCase())

    // ── Resume: retry step 2 only ───────────────────────────────────────
    // "Retry" only navigates to step 2's screen — like step 1, it
    // auto-triggers the wallet request as soon as that screen is active.
    await retryButton.click()
    await expect
      .poll(
        () => wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
        {
          timeout: 15_000,
        },
      )
      .toBeGreaterThanOrEqual(1)
    await authorizeTransaction(wallet, 60_000)

    // KNOWN DEFECT E2E-003 (docs/e2e-defects.md): retrying a step whose
    // wallet prompt was previously rejected deterministically fails here —
    // "Failed to submit transaction: An unknown RPC error occurred" — every
    // time, not intermittently. Per rule 1, the assertion stays exactly what
    // a working resume requires; it must start passing when the defect is
    // fixed, not be weakened to match the current broken behaviour.
    await expect(
      dialog.getByText('Transaction Error'),
      'E2E-003: resubmitting a rejected step should succeed cleanly, not fail at the RPC layer',
    ).toBeHidden({ timeout: 30_000 })

    await expect
      .poll(() => successCount.get(transferId) ?? 0, { timeout: 30_000 })
      .toBe(1)
    await expect(async () => {
      const doneButton = dialog.getByRole('button', { name: /^Done$/i })
      await expect(doneButton).toBeEnabled({ timeout: 2_000 })
      await doneButton.click()
    }).toPass({ timeout: 60_000 })

    await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
      timeout: 30_000,
    })
    await expectOwnerOnNamePages(page, name, recipient)

    // Idempotent resume: step 1 never re-ran even though the flow stalled
    // and was resumed after it had already succeeded.
    expect(successCount.get(detachId)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// WEB-281: a wallet switched to a chain the portal does not declare
//
// Bug: `TransactionRequest.chainId` is fixed when a request is built (Sepolia
// here: calldata, contract addresses and price all belong to it), but nothing
// downstream compared it with the chain the wallet would actually send on. The
// portal declares Sepolia alone and never re-checks the chain after connect, so
// a wallet switched to another network gets `walletClient.chain === undefined`
// from wagmi. The EOA transport passed that on as `chain: null`, which switches
// OFF viem's own `assertCurrentChain` — so the wallet was asked to send the
// Sepolia calldata on whatever chain it was on.
//
// Fix (#1108): the EOA transport refuses with `ChainIdMismatchError` before the
// wallet is prompted, passes a real `Chain` to viem (never `null`), and the
// machine treats the error as non-retryable.
//
// What these reach that the package's unit tests don't: the real wagmi
// `walletClient` produced by a live `chainChanged` after connect (the unit
// tests hand-build `{ chain: undefined }`), the real transaction machine with
// its retry policy (the PR has no machine test), the modal copy a user reads,
// and recovery in the same modal once the wallet is back on Sepolia.
//
// Oracle: the headless wallet's own queue of `eth_sendTransaction` prompts —
// the exact boundary the bug crossed — plus chain reads of the name.
// ---------------------------------------------------------------------------

const CHAIN_MISMATCH_COPY =
  'Chain mismatch: this transaction is for chain 11155111, but your wallet is on a network this app does not support.'

/**
 * Presses Start, then Open wallet, and waits until the first step has settled
 * one way or the other: either the wallet got a send prompt, or the step shows
 * a Transaction Error. Waiting on both keeps the pre-fix build failing on the
 * prompt-count assertion that follows rather than on a timeout.
 */
async function submitFirstStep(page: Page, wallet: Web3ProviderBackend) {
  const dialog = page.locator('[data-slot="dialog-content"]')
  await dialog.getByRole('button', { name: 'Start', exact: true }).click()
  await dialog.getByRole('button', { name: 'Open wallet', exact: true }).click()
  await expect
    .poll(
      async () =>
        wallet.getPendingRequestCount(Web3RequestKind.SendTransaction) > 0 ||
        (await dialog.getByText('Transaction Error').isVisible()),
      { timeout: 30_000 },
    )
    .toBe(true)
  return dialog
}

test.describe('Portal name transfer — wallet on an undeclared chain (WEB-281)', () => {
  test('does not ask a wallet on another network to send, and says why', {
    tag: ['@smoke'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(180_000)

    const mismatchLogs: string[] = []
    page.on('console', (msg) => {
      if (msg.text().includes('EOA transaction chain mismatch'))
        mismatchLogs.push(msg.text())
    })

    await connectWithHeadlessWallet(page, wallet)
    const name = await makeName({
      label: `web281-${Date.now().toString(36)}`,
      owner: 'user',
    })
    const label = name.replace(/\.eth$/, '')
    const owner = accounts.getAddress('user')
    const [resolverBefore] = await readResolverAndSubregistry(label)

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByRole('heading', { name: 'Transfer ownership' }),
    ).toBeVisible({ timeout: 15_000 })

    // The report's repro: connected on Sepolia, then the wallet is switched
    // to another network. The page keeps offering the transfer.
    await switchWalletToUndeclaredChain(page, wallet)
    await page
      .getByPlaceholder('ENS name or address')
      .fill(accounts.getAddress('user2'))
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()

    const dialog = await submitFirstStep(page, wallet)

    // ── The bug: the wallet was asked to send Sepolia calldata on chain 1 ──
    expect(
      wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
      'the wallet must not be prompted to send while it is on another chain',
    ).toBe(0)

    // The user is told why, in the modal, instead of a silent failure.
    await expect(dialog.getByText(CHAIN_MISMATCH_COPY).first()).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Try again', exact: true }),
    ).toBeVisible()

    // Non-retryable: the machine must not keep re-running the same check in
    // the background. Give a retry policy time to fire, then count.
    await page.waitForTimeout(5_000)
    expect(
      mismatchLogs,
      'ChainIdMismatchError is not retried automatically',
    ).toHaveLength(1)
    expect(wallet.getPendingRequestCount(Web3RequestKind.SendTransaction)).toBe(
      0,
    )

    // Nothing reached the chain: resolver still attached, owner unchanged.
    const [resolverAfter] = await readResolverAndSubregistry(label)
    expect(resolverAfter).toBe(resolverBefore)
    expect(resolverAfter).not.toBe(zeroAddress)
    expect((await ownerOfName(label)).toLowerCase()).toBe(owner.toLowerCase())
  })

  test('finishes the transfer from the same modal once the wallet is back on Sepolia', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
    test.setTimeout(240_000)

    await connectWithHeadlessWallet(page, wallet)
    const name = await makeName({
      label: `web281-back-${Date.now().toString(36)}`,
      owner: 'user',
    })
    const label = name.replace(/\.eth$/, '')
    const recipient = accounts.getAddress('user2')

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByRole('heading', { name: 'Transfer ownership' }),
    ).toBeVisible({ timeout: 15_000 })
    await switchWalletToUndeclaredChain(page, wallet)
    await page.getByPlaceholder('ENS name or address').fill(recipient)
    await page.getByRole('button', { name: 'Transfer name' }).click()

    const dialog = await submitFirstStep(page, wallet)
    expect(wallet.getPendingRequestCount(Web3RequestKind.SendTransaction)).toBe(
      0,
    )
    await expect(dialog.getByText(CHAIN_MISMATCH_COPY).first()).toBeVisible()

    // Positive control: the guard blocks the wrong chain, not the flow. Back
    // on Sepolia, "Try again" re-resolves the signer and the wallet is asked.
    await switchWalletToSepolia(page, wallet)
    await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect
      .poll(
        () => wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
        { timeout: 15_000 },
      )
      .toBe(1)
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'detach-resolver'),
      transferTxId(name, 'transfer-token'),
    ])

    // Landed on Sepolia, where the calldata belongs.
    expect((await ownerOfName(label)).toLowerCase()).toBe(
      recipient.toLowerCase(),
    )
    const [resolverAfter] = await readResolverAndSubregistry(label)
    expect(resolverAfter).toBe(zeroAddress)
  })
})

// ---------------------------------------------------------------------------
// Guard / validation states that never reach the chain
// ---------------------------------------------------------------------------
test.describe('Portal name transfer — guards', () => {
  test('rejects the zero address as a recipient', {
    tag: ['@scenario:F10'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    test.setTimeout(120_000)

    await connectWithHeadlessWallet(page, wallet)
    const name = await makeName({ label: 'guard-zero-addr', owner: 'user' })

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(zeroAddress)

    await expect(
      page.getByText('Can’t transfer to the zero address.'),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('button', { name: 'Transfer name' }),
    ).toBeDisabled()
  })

  test('accepts a recipient address with surrounding whitespace', {
    tag: ['@scenario:F10'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(120_000)

    await connectWithHeadlessWallet(page, wallet)
    const name = await makeName({ label: 'guard-whitespace', owner: 'user' })
    const recipient = accounts.getAddress('user2')

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    // `useAddressResolution` trims before validating, so padding must not
    // make an otherwise-valid address look invalid.
    await page.getByPlaceholder('ENS name or address').fill(`  ${recipient}  `)

    await expect(page.getByText(recipient)).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('button', { name: 'Transfer name' }),
    ).toBeEnabled({ timeout: 15_000 })
  })

  test('shows "Not authorized" to a wallet that does not own the name', {
    tag: ['@scenario:F13'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    test.setTimeout(120_000)

    await connectWithHeadlessWallet(page, wallet)
    // Owned by `user2`; the connected wallet is `user`.
    const name = await makeName({ label: 'guard-not-owner', owner: 'user2' })

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(page.getByText('Not authorized')).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      page.getByText('You are not the owner of this name.'),
    ).toBeVisible()
    await expect(page.getByPlaceholder('ENS name or address')).toBeHidden()

    // ...and the Ownership tab must not offer the entry point either.
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    await expect(page.getByRole('heading', { name: 'Ownership' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('link', { name: 'Transfer' })).toBeHidden()
  })

  test('asks a disconnected visitor to connect their wallet', {
    tag: ['@scenario:F13'],
  }, async ({ portalPage: page, makeName }) => {
    test.setTimeout(120_000)

    // Deliberately NOT calling connectWithHeadlessWallet.
    const name = await makeName({ label: 'guard-disconnected', owner: 'user' })

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(page.getByText('Connect your wallet')).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      page.getByText('Connect the wallet that owns this name to transfer it.'),
    ).toBeVisible()
    await expect(page.getByPlaceholder('ENS name or address')).toBeHidden()
  })
})

// ---------------------------------------------------------------------------
// V1 names migrated to V2 — the state most real names are in
//
// `makeMigratedName` registers a real V1 name and puts it through the actual
// `MigrationHelper.migrate` entrypoint, so these exercise genuine post-migration
// state. What each V1 token type becomes in v2 (measured — see
// e2e/scripts/probe-migrated.ts):
//
//   unwrapped / unlocked → resolver set, subregistry 0x0, owner holds every role
//   locked               → resolver set, subregistry NON-ZERO,
//                          owner does NOT hold ROLE_SET_SUBREGISTRY
// ---------------------------------------------------------------------------
test.describe('Portal name transfer — migrated V1 names', () => {
  for (const type of ['unwrapped', 'unlocked'] as const) {
    test(`transfers a migrated ${type} V1 name`, {
      tag: ['@scenario:F1'],
    }, async ({ portalPage: page, wallet, accounts, makeMigratedName }) => {
      test.setTimeout(240_000)

      await connectWithHeadlessWallet(page, wallet)

      const name = await makeMigratedName({ label: `mig-${type}`, type })
      const label = name.replace(/\.eth$/, '')
      const owner = accounts.getAddress('user')
      const recipient = accounts.getAddress('user2')

      // Migration leaves the owner with the transfer role, so the Ownership
      // tab must offer the entry point.
      expect(await ownerHasRole(label, 'ROLE_CAN_TRANSFER_ADMIN', owner)).toBe(
        true,
      )

      await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
      await page.getByRole('link', { name: 'Transfer' }).click()
      await expect(
        page.getByRole('heading', { name: 'Transfer ownership' }),
      ).toBeVisible({ timeout: 20_000 })

      await page.getByPlaceholder('ENS name or address').fill(recipient)

      const transferButton = page.getByRole('button', { name: 'Transfer name' })
      await expect(transferButton).toBeEnabled({ timeout: 30_000 })

      // Migration always writes the v2 PublicResolver, so the resolver detach
      // is offered and on; these types migrate with no subregistry, so the
      // registry detach is hidden entirely.
      await expect(
        page.getByRole('switch', { name: /Detach the resolver/ }),
      ).toBeChecked()
      await expect(
        page.getByRole('switch', { name: /Detach the registry/ }),
      ).toBeHidden()

      await transferButton.click()

      await driveTransactionsToSuccess(page, wallet, [
        `transfer-${name}-detach-resolver`,
        `transfer-${name}-transfer-token`,
      ])
      await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
        timeout: 30_000,
      })

      await expectOwnerOnNamePages(page, name, recipient)
    })
  }

  /**
   * Regression guard for WEB-446's role-validation fix.
   *
   * A locked V1 name migrates into a dedicated subregistry (the wrapper holding
   * its emancipated subnames) that its owner has NO authority over — it never
   * receives `ROLE_SET_SUBREGISTRY`. Before the fix,
   * `useTransferDetachTargets` offered "Detach the registry" purely because a
   * subregistry existed, defaulted it ON, and the resulting `setSubregistry`
   * reverted with `EACUnauthorizedAccountRoles(resource, 0x100000, owner)`.
   * Since detach steps run BEFORE the token moves, the user was left with the
   * resolver irreversibly detached and the name still un-transferred.
   *
   * The hook now requires the matching role as well as a target, so the option
   * is hidden entirely and the default plan is the two steps the owner can
   * actually perform. This test pins that: the on-chain preconditions that
   * caused the bug are asserted directly, so it fails if either the role
   * behaviour or the gating regresses.
   */
  test('transfers a migrated locked V1 name with the default options, without offering the registry detach it cannot perform', {
    tag: ['@scenario:F1'],
  }, async ({ portalPage: page, wallet, accounts, makeMigratedName }) => {
    test.setTimeout(240_000)

    await connectWithHeadlessWallet(page, wallet)

    const name = await makeMigratedName({
      label: 'mig-locked-default',
      type: 'locked',
    })
    const label = name.replace(/\.eth$/, '')
    const owner = accounts.getAddress('user')
    const recipient = accounts.getAddress('user2')

    // The bug's preconditions: a real subregistry to detach, no authority to
    // detach it, but transfer rights intact.
    const [, subregistryBefore] = await readResolverAndSubregistry(label)
    expect(subregistryBefore).not.toBe(zeroAddress)
    expect(await ownerHasRole(label, 'ROLE_SET_SUBREGISTRY', owner)).toBe(false)
    expect(await ownerHasRole(label, 'ROLE_SET_RESOLVER', owner)).toBe(true)
    expect(await ownerHasRole(label, 'ROLE_CAN_TRANSFER_ADMIN', owner)).toBe(
      true,
    )

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 30_000 })

    // The fix: target present but role absent → the option must not be offered.
    await expect(
      page.getByRole('switch', { name: /Detach the registry/ }),
    ).toBeHidden()
    // The resolver detach has both a target and the role, so it stays.
    await expect(
      page.getByRole('switch', { name: /Detach the resolver/ }),
    ).toBeChecked()

    // Nothing touched — straight through on the defaults.
    await transferButton.click()

    await driveTransactionsToSuccess(page, wallet, [
      `transfer-${name}-detach-resolver`,
      `transfer-${name}-transfer-token`,
    ])
    await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
      timeout: 30_000,
    })

    await expectOwnerOnNamePages(page, name, recipient)

    // The subregistry the owner couldn't detach is handed over untouched.
    const [, subregistryAfter] = await readResolverAndSubregistry(label)
    expect(subregistryAfter.toLowerCase()).toBe(subregistryBefore.toLowerCase())
  })

  test('hands the full role set to the recipient and leaves the sender none', {
    tag: ['@scenario:F7', '@scenario:F9'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(180_000)
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({ label: 'transfer-f7', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    const sender = accounts.getAddress('user')
    const recipient = accounts.getAddress('user2')

    const senderRolesBefore = (await readNameRoles({ label }, sender)).decoded
    expect(
      senderRolesBefore.length,
      'the owner should start holding roles',
    ).toBeGreaterThan(0)
    await assertRoleBitmap({ label }, recipient, [])

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()

    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'detach-resolver'),
      transferTxId(name, 'transfer-token'),
    ])

    // The role set follows the token exactly. The half that matters is the
    // second assertion: a transfer that left the sender any authority would
    // still look successful from the recipient's side.
    await assertRoleBitmap({ label }, recipient, senderRolesBefore)
    await assertRoleBitmap({ label }, sender, [])
  })

  test('refuses to transfer an expired name', {
    tag: ['@scenario:F4'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(180_000)
    await connectWithHeadlessWallet(page, wallet)

    // Reaching an expired name means fast-forwarding the chain, and that jump
    // outlives the test: a later subname registration then computes an expiry
    // behind the new clock and reverts CannotSetPastExpiry. Snapshot/revert
    // (plan item H5) keeps the time travel inside this test.
    await withChainSnapshot(async () => {
      // Expiry clears the role set outright — measured for C7 — so the former
      // owner no longer holds ROLE_CAN_TRANSFER_ADMIN and has nothing to
      // transfer, even though the name is still theirs in every colloquial
      // sense.
      const name = await makeName({
        label: 'transfer-f4',
        owner: 'user',
        duration: -86_400,
      })
      const label = name.replace(/\.eth$/, '')
      const owner = accounts.getAddress('user')

      await assertRoleBitmap({ label }, owner, [])

      await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
      // "Transfer not available", not the "Not authorized" used for a wallet
      // that never owned the name — the distinction is that this wallet *is* the
      // owner, it simply holds no roles any more.
      await expect(
        page.getByText('Transfer not available'),
        'an expired name holds no transfer authority, so the form must be refused',
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        page.getByRole('button', { name: 'Transfer name' }),
        'and the transfer control must not be reachable',
      ).toHaveCount(0)
    })
  })

  test('does not offer transfer for a name with CANNOT_TRANSFER burnt', {
    tag: ['@scenario:F2'],
  }, async ({ portalPage: page, wallet, accounts, makeMigratedName }) => {
    test.setTimeout(240_000)
    await connectWithHeadlessWallet(page, wallet)

    // §3.4 of the plan: CANNOT_TRANSFER in V1 must map to the migrated name
    // *not* receiving ROLE_CAN_TRANSFER_ADMIN in V2.
    const name = await makeMigratedName({
      label: 'transfer-f2',
      type: 'locked',
      fuses: FUSES.CANNOT_TRANSFER,
    })
    const label = name.replace(/\.eth$/, '')
    const owner = accounts.getAddress('user')

    await assertLacksRoles({ label }, owner, ['ROLE_CAN_TRANSFER_ADMIN'])

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByText('Transfer permanently disabled'),
      // A migrated locked name classifies as ENSv1, so #1134 routes it to
      // V1Transfer and this is the V1 card. Before that PR there was no V1
      // path and everything landed on the V2 component's "Transfer not
      // available" — so this test passed without the classification ever being
      // visible. The refusal is the same; only which component renders it
      // changed. See V1-F1 in transfer-v1-web1396-test-plan.md.
      'a name that burnt CANNOT_TRANSFER in V1 must not be transferable in V2',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: 'Transfer name' }),
    ).toHaveCount(0)
  })

  test('surfaces an error when the recipient cannot receive the token', {
    tag: ['@scenario:F5'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(180_000)
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({ label: 'transfer-f5', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    const owner = accounts.getAddress('user')
    // Multicall3: definitely deployed, definitely not an ERC-1155 receiver, so
    // safeTransferFrom to it reverts.
    const notAReceiver = '0xcA11bde05977b3631167028862bE2a173976CA11'

    const [resolverBefore] = await readResolverAndSubregistry(label)
    expect(resolverBefore).not.toBe(zeroAddress)

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(notAReceiver)
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 15_000 })
    await transferButton.click()

    // Drive the modal as far as it will go, authorising whatever it asks for.
    const dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      const open = dialog.getByRole('button', { name: /open wallet/i })
      if (await open.isVisible().catch(() => false)) {
        await open.click()
        await authorizeTransaction(wallet, 30_000).catch(() => {})
        await page.waitForTimeout(500)
        continue
      }
      const primary = dialog.getByRole('button', { name: /^(Start|Next)$/i })
      if (
        (await primary.isVisible().catch(() => false)) &&
        (await primary.isEnabled().catch(() => false))
      ) {
        await primary.click()
        await page.waitForTimeout(500)
        continue
      }
      break
    }

    // The token must not have moved…
    expect(
      (await ownerOfName(label)).toLowerCase(),
      'a transfer to a non-receiver must not move the token',
    ).toBe(owner.toLowerCase())

    // …and nothing irreversible may have been done on its behalf. The plan
    // runs detach-resolver *before* transfer-token, so a recipient that cannot
    // receive leaves the name stripped of its resolver with the token still in
    // place — the same shape as E2E-001.
    const [resolverAfter] = await readResolverAndSubregistry(label)
    expect(
      resolverAfter,
      'the resolver must not be detached for a transfer that cannot complete',
    ).toBe(resolverBefore)

    // …and the failure must be visible rather than a silent stall.
    await expect(
      dialog.getByText(/fail|error|revert|unable/i).first(),
      'the failed step must be surfaced, not left hanging',
    ).toBeVisible({ timeout: 30_000 })
  })
})

/**
 * Subname transfer — WEB-128 / #1120.
 *
 * #1120 removes the `is2LD` gate and puts three genuinely new pieces of
 * machinery in its place. Each is covered below, and each has a different
 * registry as its subject, which is the whole difficulty of this feature:
 *
 * - a subname's token lives in the **parent's subregistry**, not `.eth`
 * - `useParentAuthority`'s three reads span BOTH registries, and one of them
 *   is at ROOT resource `0` rather than the name's own
 * - `getOwnResolver` reads the subname's **own** registry slot, where the
 *   pre-#1120 code read the UniversalResolver and so saw the *inherited* one
 *
 * Ground truth for every shape here is measured, not assumed — see
 * `e2e/scripts/probe-subname-transfer.ts`, which seeds these same shapes and
 * prints what the chain says. Two of the shapes below only work because that
 * probe caught them being wrong the first time; the comments say which.
 */
test.describe('Portal name transfer — subnames', () => {
  /**
   * Parent 2LD + one subname inside it, with the knobs the scenarios vary.
   *
   * `owner` deliberately defaults to the *deployer*, and `subnameOwner` exists
   * so a scenario can hand the subname to somebody else. That distinction is
   * load-bearing: `hasRoles` resolves
   * `roles[ROOT_RESOURCE][account] | roles[resource][account]`, so whoever
   * deployed the subregistry holds every role at its root and a revoke on the
   * subname's own resource reads as no revoke at all. Measured — the probe's
   * first run reported a full transfer role on a subname it had explicitly
   * withheld it from.
   */
  async function makeSubnameUnder(
    {
      parentLabel,
      subLabel = 'sub',
      subnameOwner,
      roleBitmap = FULL_ROLE_BITMAP,
    }: {
      parentLabel: string
      subLabel?: string
      subnameOwner?: Address
      roleBitmap?: bigint
    },
    deployerKey: Hash,
  ): Promise<{ subregistry: Address }> {
    const deployer = privateKeyToAccount(deployerKey)
    const subregistry = await deployAndAttachSubregistry(
      { label: parentLabel },
      deployer,
    )
    await createSubname(
      {
        registryAddress: subregistry,
        label: subLabel,
        parentLabel,
        owner: subnameOwner,
        roleBitmap,
      },
      deployer,
    )
    return { subregistry }
  }

  /** The `[role="alert"]` carrying the parent-authority warning, if any. */
  const parentAuthorityAlert = (page: Page) =>
    page.locator('[role="alert"]', { hasText: 'is a subname of' })

  const transferRoute = (name: string) =>
    `${PORTAL_APP_URL}/${name}/ownership/transfer`

  test('transfers a subname, moving the token in the parent subregistry and leaving the parent untouched', {
    tag: ['@scenario:F15'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const owner = accounts.getAddress('user')
    const recipient = accounts.getAddress('user2')
    const parentName = await makeName({ label: 'sub-xfer-f15', owner: 'user' })
    const parentLabel = parentName.replace(/\.eth$/, '')
    const { subregistry } = await makeSubnameUnder(
      { parentLabel },
      accounts.getPrivateKey('user'),
    )
    const name = `sub.${parentName}`

    // Pre-state on the PARENT, so the post-transfer check can prove the
    // parent's own token was not collateral damage.
    const [parentResolverBefore, parentSubregistryBefore] =
      await readResolverAndSubregistry(parentLabel)
    const parentOwnerBefore = await ownerOfName(parentLabel)

    expect(
      (await getOwner(publicClient as never, { name })) as Address,
      'the subname should start out owned by the connected wallet',
    ).toBe(owner)

    await page.goto(transferRoute(name))
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    // The button stays disabled until the detach-target reads AND the
    // parent-authority reads have settled, so wait on the control rather than
    // on a fixed delay.
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })
    await transferButton.click()

    // Inherited resolver and no subregistry of its own, so the plan is the
    // single-step one: nothing to detach.
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'transfer-token'),
    ])

    // Chain first — the rendering is checked after, never instead.
    await expect
      .poll(
        async () =>
          ((await getOwner(publicClient as never, { name })) as Address) ?? '',
        {
          message: 'the subname token must move to the recipient',
          timeout: 60_000,
        },
      )
      .toBe(recipient)

    // The parent is a different token in a different registry and must be
    // completely unaffected — owner, resolver and subregistry pointer alike.
    expect(await ownerOfName(parentLabel)).toBe(parentOwnerBefore)
    const [parentResolverAfter, parentSubregistryAfter] =
      await readResolverAndSubregistry(parentLabel)
    expect(
      parentResolverAfter,
      "transferring a subname must not touch the parent's resolver",
    ).toBe(parentResolverBefore)
    expect(
      parentSubregistryAfter.toLowerCase(),
      'and must leave the parent still pointing at the same subregistry',
    ).toBe(parentSubregistryBefore.toLowerCase())
    expect(
      parentSubregistryAfter.toLowerCase(),
      'sanity: that subregistry is the one the subname lives in',
    ).toBe(subregistry.toLowerCase())
  })

  test('warns that the parent owner keeps authority, listing exactly the powers they hold', {
    tag: ['@scenario:F16'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(240_000)
    await connectWithHeadlessWallet(page, wallet)

    const parentName = await makeName({ label: 'sub-xfer-f16', owner: 'user' })
    const parentLabel = parentName.replace(/\.eth$/, '')
    await makeSubnameUnder({ parentLabel }, accounts.getPrivateKey('user'))
    const name = `sub.${parentName}`

    await page.goto(transferRoute(name))

    const alert = parentAuthorityAlert(page)
    await expect(
      alert,
      'a subname must warn about the parent owner',
    ).toBeVisible({ timeout: 60_000 })

    // Asserted on textContent rather than with getByText: the parent name is
    // rendered inside its own <span>, so the sentence is split across DOM
    // nodes and a whole-string text matcher never matches.
    const text = (await alert.textContent()) ?? ''

    // The connected wallet owns the parent here, so the copy addresses them
    // directly. #1144 rewrote this from "its owner (you) keeps authority over
    // it — they can" to second person throughout; the old parenthetical must
    // not survive alongside the new sentence.
    expect(
      text,
      'the parent owner is the reader, so the copy says so',
    ).toContain(', which you own, so you keep authority over it — you can ')
    expect(text).not.toContain('(you)')
    expect(text).toContain(
      `This transfer isn't final the way transferring ${parentLabel}.eth itself would be.`,
    )

    // The subregistry was deployed by the parent owner, who therefore holds
    // all three powers — so all three clauses must appear, joined the way the
    // component composes them.
    expect(text).toContain(
      'take it back at any time, without waiting for it to expire',
    )
    expect(text).toContain('issue it to someone else once it expires')
    expect(text).toContain(
      `point ${parentLabel}.eth at a different registry, which stops this name resolving no matter who owns it`,
    )
    expect(text, 'three powers must be joined "a; b; and c"').toContain(
      '; and ',
    )

    // A 2LD has no parent whose owner could hold anything, so the same page
    // for the parent must not carry the warning at all. Without this the test
    // would pass against a build that showed the alert unconditionally.
    await page.goto(transferRoute(parentName))
    await expect(page.getByPlaceholder('ENS name or address')).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      parentAuthorityAlert(page),
      'a 2LD has no parent authority to warn about',
    ).toHaveCount(0)
  })

  test('offers no resolver detach for a subname that only inherits its parent resolver', {
    tag: ['@scenario:F19'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const recipient = accounts.getAddress('user2')
    // `records` gives the PARENT a real resolver; the subname gets none of its
    // own, so it merely inherits — the exact shape #1120's getOwnResolver
    // changed behaviour for.
    const parentName = await makeName({
      label: 'sub-xfer-f19',
      owner: 'user',
      records: [{ key: 'description', value: 'parent with a resolver' }],
    })
    const parentLabel = parentName.replace(/\.eth$/, '')
    const { subregistry } = await makeSubnameUnder(
      { parentLabel },
      accounts.getPrivateKey('user'),
    )
    const name = `sub.${parentName}`

    const [parentResolverBefore] = await readResolverAndSubregistry(parentLabel)
    expect(
      parentResolverBefore,
      'precondition: the parent must actually have a resolver to inherit',
    ).not.toBe(zeroAddress)
    expect(
      await publicClient.readContract({
        address: subregistry,
        abi: permissionedRegistryGetResolverSnippet,
        functionName: 'getResolver',
        args: ['sub'],
      }),
      'precondition: and the subname must have none of its own',
    ).toBe(zeroAddress)

    await page.goto(transferRoute(name))
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })

    // Before #1120 both of these rendered. The detach would have been a no-op
    // write (the name kept resolving through the parent) and the ETH-address
    // write would have targeted the PARENT's resolver — a contract the sender
    // is usually not authorised on, so it reverted mid-plan.
    await expect(
      page.locator('#transfer-option-detachResolver'),
      "an inherited resolver is not this name's to detach",
    ).toHaveCount(0)
    await expect(
      page.locator('#transfer-option-setEthAddress'),
      'and there is no own resolver to write addr(60) on',
    ).toHaveCount(0)

    await transferButton.click()
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'transfer-token'),
    ])

    await expect
      .poll(
        async () =>
          ((await getOwner(publicClient as never, { name })) as Address) ?? '',
        { message: 'the subname token must move', timeout: 60_000 },
      )
      .toBe(recipient)

    // The point of the whole scenario: the parent's resolver is untouched.
    const [parentResolverAfter] = await readResolverAndSubregistry(parentLabel)
    expect(
      parentResolverAfter,
      "transferring a subname must never detach or repoint the PARENT's resolver",
    ).toBe(parentResolverBefore)
  })

  test('refuses to transfer a subname whose owner lacks the transfer role', {
    tag: ['@scenario:F21'],
  }, async ({ portalPage: page, wallet, accounts, makeName, wallets }) => {
    test.setTimeout(240_000)

    // The subname is owned by `stranger`, NOT by the account that deployed the
    // subregistry — otherwise root roles would grant the transfer role back
    // regardless of the bitmap withheld here. Measured; see makeSubnameUnder.
    const holder = wallets.address('stranger')
    const parentName = await makeName({ label: 'sub-xfer-f21', owner: 'user' })
    const parentLabel = parentName.replace(/\.eth$/, '')
    const { subregistry } = await makeSubnameUnder(
      {
        parentLabel,
        subnameOwner: holder,
        roleBitmap: withoutRole(FULL_ROLE_BITMAP, ROLE_BIT.canTransferAdmin),
      },
      accounts.getPrivateKey('user'),
    )
    const name = `sub.${parentName}`

    // A control in the same registry, owned by the same wallet, differing ONLY
    // in that it keeps the transfer role. Without it this test passes for the
    // wrong reason: before #1120 every subname was refused by the blanket
    // is2LD gate, so "Transfer not available" proved nothing about roles.
    // Measured — run against a tree without #1120, this case was the one
    // member of the subname block that still went green.
    await createSubname(
      {
        registryAddress: subregistry,
        label: 'control',
        parentLabel,
        owner: holder,
        roleBitmap: FULL_ROLE_BITMAP,
      },
      privateKeyToAccount(accounts.getPrivateKey('user')),
    )
    const controlName = `control.${parentName}`

    expect(
      await hasRoles(
        publicClient as never,
        {
          registryAddress: subregistry,
          label: 'sub',
          roles: ['ROLE_CAN_TRANSFER_ADMIN'],
          account: holder,
        } as never,
      ),
      'precondition: the holder must genuinely lack the transfer role',
    ).toBe(false)

    await connectWithHeadlessWallet(page, wallet)
    await wallets.switchTo('stranger')

    await page.goto(transferRoute(name))
    await expect(
      page.getByText('Transfer not available'),
      'an owner without ROLE_CAN_TRANSFER_ADMIN must be refused',
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByPlaceholder('ENS name or address'),
      'and must not be given the form anyway',
    ).toBeHidden()

    // The control: same wallet, same parent, same registry, transfer role
    // intact. It must be OFFERED — which is what proves the refusal above was
    // about the role and not about the name being a subname.
    await page.goto(transferRoute(controlName))
    await expect(
      page.getByPlaceholder('ENS name or address'),
      'a sibling subname WITH the transfer role must still be offered the form — otherwise the refusal above is a blanket subname gate, not a role check',
    ).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Transfer not available')).toBeHidden()
  })
})

/**
 * The irreversible half of subname transfer — WEB-128 / #1120.
 *
 * Split out from the block above because these tests execute a MULTI-STEP
 * plan against live contracts, and that is the shape both of this suite's
 * severe defects took: E2E-001 (a `detach-registry` offered to an owner who
 * could not perform it, after `detach-resolver` had already run irreversibly)
 * and E2E-002 (a resolver detached before a `transfer-token` that could never
 * succeed). Both were "a step that cannot be undone ran when it should not
 * have", and #1120 rewrites the hook that decides which steps to offer.
 *
 * The `subnames` block above deliberately covers only the INHERITED-resolver
 * shape, where no detach option renders and so the plan is a single
 * `transfer-token` — no irreversible step to get wrong. Unit tests
 * (`useTransferDetachTargets.test.ts`) prove the switches render for an
 * own-resolver name, but a rendered switch is not an executed plan: they mock
 * every contract, so they cannot catch a step running against the wrong
 * registry, in the wrong order, or on a resolver the sender cannot write.
 */
test.describe('Portal name transfer — subnames, irreversible steps', () => {
  /**
   * Point `subLabel`'s own resolver slot in `subregistry` at `resolver`.
   *
   * The registry takes the canonical token id, not the label string, for this
   * write — `getResolver`'s `string label` signature is the read side only.
   */
  async function setSubnameResolver(
    subregistry: Address,
    subLabel: string,
    resolver: Address,
    signerKey: Hash,
  ): Promise<void> {
    const hash = await getOwnerClient(signerKey).sendTransaction({
      to: subregistry,
      data: encodeFunctionData({
        abi: parseAbi([
          'function setResolver(uint256 tokenId, address resolver)',
        ]),
        functionName: 'setResolver',
        args: [labelToCanonicalId(subLabel), resolver],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash })
  }

  const readSubnameResolver = (subregistry: Address, subLabel: string) =>
    publicClient.readContract({
      address: subregistry,
      abi: permissionedRegistryGetResolverSnippet,
      functionName: 'getResolver',
      args: [subLabel],
    }) as Promise<Address>

  test('detaches only the subname own resolver on a defaults transfer, leaving the parent resolver intact', {
    tag: ['@scenario:F20'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const recipient = accounts.getAddress('user2')
    const ownerKey = accounts.getPrivateKey('user')

    // `records` deploys a real PermissionedResolver proxy for the parent. The
    // subname then gets its OWN slot pointed at that same contract — which is
    // the interesting case, not a lazy shortcut: the registry slot and the
    // resolver contract are independent, so "the subname has its own resolver"
    // and "it happens to be the same contract as the parent's" can both be
    // true. A plan that confuses the two would clear the parent's slot here,
    // and this test would catch it.
    const parentName = await makeName({
      label: 'sub-xfer-f20',
      owner: 'user',
      records: [{ key: 'description', value: 'parent with a resolver' }],
    })
    const parentLabel = parentName.replace(/\.eth$/, '')
    const deployer = privateKeyToAccount(ownerKey)
    const subregistry = await deployAndAttachSubregistry(
      { label: parentLabel },
      deployer,
    )
    await createSubname(
      { registryAddress: subregistry, label: 'sub', parentLabel },
      deployer,
    )
    const name = `sub.${parentName}`

    const [parentResolver] = await readResolverAndSubregistry(parentLabel)
    expect(
      parentResolver,
      'precondition: the parent must have a resolver of its own',
    ).not.toBe(zeroAddress)
    await setSubnameResolver(subregistry, 'sub', parentResolver, ownerKey)
    expect(
      await readSubnameResolver(subregistry, 'sub'),
      'precondition: and the subname must now have its OWN resolver slot set',
    ).toBe(parentResolver)

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    // With an own resolver the detach option must now be offered — the
    // opposite of F19, and the reason this test can exercise a real plan.
    await expect(
      page.locator('#transfer-option-detachResolver'),
      'a subname with its OWN resolver must be offered the detach',
    ).toBeVisible({ timeout: 60_000 })

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })
    await transferButton.click()

    // Two steps, in this order. `detach-resolver` is the irreversible one and
    // it runs FIRST, so if `transfer-token` could not succeed the name would
    // be left resolverless — exactly E2E-002. Naming both ids means the run
    // fails loudly if the plan silently changes shape.
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'detach-resolver'),
      transferTxId(name, 'transfer-token'),
    ])

    await expect
      .poll(
        async () =>
          ((await getOwner(publicClient as never, { name })) as Address) ?? '',
        { message: 'the subname token must move', timeout: 60_000 },
      )
      .toBe(recipient)

    expect(
      await readSubnameResolver(subregistry, 'sub'),
      "the subname's own resolver slot must be cleared by the detach step",
    ).toBe(zeroAddress)

    // The whole point. Both slots pointed at the SAME resolver contract, so a
    // plan that addressed the parent's registry entry instead of the
    // subname's would have looked identical up to here and left the parent
    // resolverless — an irreversible loss on a name that was never being
    // transferred.
    const [parentResolverAfter] = await readResolverAndSubregistry(parentLabel)
    expect(
      parentResolverAfter,
      "detaching a subname's resolver must not clear the PARENT's, even when both slots hold the same contract",
    ).toBe(parentResolver)
  })

  test('writes the ETH address to a resolver the name no longer points at (E2E-010)', {
    tag: ['@scenario:F20'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(300_000)

    // Expected to fail until E2E-010 is fixed, marked the way records.spec.ts
    // and subnames.spec.ts mark E2E-008 and E2E-007. This keeps the suite's
    // failure count meaningful — a red run means something genuinely
    // unaccounted, not a defect we already know about — and Playwright errors
    // if this ever PASSES, which is the notification you want the day somebody
    // fixes the stale-cache read.
    //
    // The oracle below is unchanged and unweakened; only its bookkeeping moves.
    test.fail()

    await connectWithHeadlessWallet(page, wallet)

    const recipient = accounts.getAddress('user2')
    const ownerKey = accounts.getPrivateKey('user')
    const parentName = await makeName({
      label: 'sub-xfer-e2e010',
      owner: 'user',
      records: [{ key: 'description', value: 'parent with a resolver' }],
    })
    const parentLabel = parentName.replace(/\.eth$/, '')
    const deployer = privateKeyToAccount(ownerKey)
    const subregistry = await deployAndAttachSubregistry(
      { label: parentLabel },
      deployer,
    )
    await createSubname(
      { registryAddress: subregistry, label: 'sub', parentLabel },
      deployer,
    )
    const name = `sub.${parentName}`

    // Own resolver + an addr(60) on it: the two conditions that make the app
    // offer "Set the ETH address to the recipient" at all.
    const [parentResolver] = await readResolverAndSubregistry(parentLabel)
    await setSubnameResolver(subregistry, 'sub', parentResolver, ownerKey)
    await setEthAddressRecord(name, parentResolver, recipient, ownerKey)

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    // `set-eth-addr` is only planned when the resolver is being KEPT, so turn
    // the detach off. Plan becomes [set-eth-addr, transfer-token].
    const detachResolverSwitch = page.getByRole('switch', {
      name: /Detach the resolver/,
    })
    await expect(detachResolverSwitch).toBeVisible({ timeout: 60_000 })
    await detachResolverSwitch.click()
    await expect(
      page.getByRole('switch', { name: /Set the ETH address/ }),
      'keeping the resolver must re-enable the ETH-address option',
    ).toBeEnabled({ timeout: 15_000 })

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })

    // The race, made deterministic: clear the subname's own resolver AFTER the
    // form has read it but BEFORE the step executes.
    await setSubnameResolver(subregistry, 'sub', zeroAddress, ownerKey)
    expect(await readSubnameResolver(subregistry, 'sub')).toBe(zeroAddress)

    // Watch the transaction manager's own success lines, so the oracle below
    // is about what the app *reported*, not about what a UI element rendered.
    const succeeded = new Set<string>()
    page.on('console', (msg) => {
      const m = /Transaction (\S+) state: success/.exec(msg.text())
      if (m?.[1]) succeeded.add(m[1])
    })

    await transferButton.click()

    // Driven with the shared helper rather than a hand-rolled authorize loop.
    // That matters for honesty: a bounded loop that simply never got the step
    // running would leave `succeeded` empty and make the oracle below pass
    // while proving nothing. The helper advances the modal and authorizes each
    // prompt until every named id reports success, so if it returns, the steps
    // genuinely ran.
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'set-eth-addr'),
      transferTxId(name, 'transfer-token'),
    ])

    // THE ORACLE — this is expected to FAIL until the defect is fixed, the same
    // way F5's and F14's assertions do. `runStep('set-eth-addr')` re-reads the
    // name's own resolver and throws `has no resolver of its own to update`
    // when it is gone, which it is: cleared above, before the step ran. The
    // step must therefore not report success.
    //
    // It does. `utils/queryClient.ts` sets `staleTime: 1000 * 60 * 60`, so the
    // `queryClient.fetchQuery` inside that guard is served from the value
    // cached when the form rendered and never re-reads the chain. The guard
    // cannot fire, and its own comment — "a null here means the state changed
    // underneath us; fail before touching the chain" — describes behaviour the
    // app does not have. The write goes to whichever resolver was cached.
    //
    // Harmless in THIS shape only: the subname's own slot and its parent's
    // held the same contract, so the name inherits its way back to the very
    // resolver that was written and `addr(60)` still resolves. When the two
    // differ — the ordinary case, and the one `getOwnResolver` exists for —
    // the record lands on a contract the name no longer references while the
    // user is told the update succeeded.
    expect(
      succeeded.has(transferTxId(name, 'set-eth-addr')),
      'E2E-010: set-eth-addr must refuse once the name has no resolver of its ' +
        'own — the guard for exactly this is inert because fetchQuery is served ' +
        'from a 1-hour-stale cache, so the write lands on a stale resolver and ' +
        'is reported as success',
    ).toBe(false)
  })
})

/**
 * Unmigrated V1 name transfer — WEB-1396 / #1134.
 *
 * Distinct from the "migrated V1 names" block above, which moves names that
 * have already become V2 tokens by the time the portal touches them. These are
 * names still living in V1, which the portal previously refused outright.
 *
 * The shape with no V2 analogue, and the reason this needs its own coverage:
 * an unwrapped V1 2LD splits ownership in two. `BaseRegistrar` holds the
 * **registrant** (the ERC-721) and `ENSRegistry` holds the **controller** (who
 * may set records). They can be different accounts, and a complete transfer
 * must move both. Moving only the token hands over the asset while leaving the
 * old owner able to repoint the resolver and rewrite every record.
 *
 * `getV1TransferGate` (v1/rules.ts) resolves that shape into one of six
 * outcomes, each with its own card.
 */
test.describe('Portal name transfer — unmigrated V1 names', () => {
  const V1_BASE_REGISTRAR_ABI = parseAbi([
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function safeTransferFrom(address from, address to, uint256 tokenId)',
  ])
  const V1_REGISTRY_ABI = parseAbi([
    'function owner(bytes32 node) view returns (address)',
  ])

  const tokenIdFor = (label: string) => BigInt(labelhash(label))

  /** The ERC-721 registrant — who owns the name in `BaseRegistrar`. */
  const readRegistrant = (label: string) =>
    publicClient.readContract({
      address: V1_BASE_REGISTRAR,
      abi: V1_BASE_REGISTRAR_ABI,
      functionName: 'ownerOf',
      args: [tokenIdFor(label)],
    }) as Promise<Address>

  /** ERC-1155 owner of a wrapped name, per the `NameWrapper`. */
  const readWrapperOwner = (tokenId: bigint) =>
    publicClient.readContract({
      address: V1_NAME_WRAPPER,
      abi: parseAbi(['function ownerOf(uint256 id) view returns (address)']),
      functionName: 'ownerOf',
      args: [tokenId],
    }) as Promise<Address>

  /** The controller — who may set records, per the legacy `ENSRegistry`. */
  const readController = (name: string) =>
    publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: V1_REGISTRY_ABI,
      functionName: 'owner',
      args: [namehash(name)],
    }) as Promise<Address>

  test('transfers an unwrapped V1 name, moving BOTH the registrant and the controller', {
    tag: ['@scenario:F23'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const owner = accounts.getAddress('user')
    const recipient = accounts.getAddress('user2')
    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })
    const name = await makeV1Name({ label: 'v1-xfer-f23', type: 'unwrapped' })
    const label = name.replace(/\.eth$/, '')

    expect(
      (await readRegistrant(label)).toLowerCase(),
      'precondition: the connected wallet is the registrant',
    ).toBe(owner.toLowerCase())
    expect(
      (await readController(name)).toLowerCase(),
      'precondition: and the controller',
    ).toBe(owner.toLowerCase())

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })
    await transferButton.click()

    // An unwrapped V1 2LD moves in two writes, and their ORDER is load-bearing:
    // `reclaim` hands over the controller slot first, because once the ERC-721
    // has moved the sender is no longer the registrant and can no longer
    // reclaim — stranding the controller slot with the old owner. Naming both
    // ids makes the run fail loudly if the plan ever changes shape.
    //
    // Driven with the shared helper rather than a hand-rolled authorize loop.
    // The first draft used the latter and timed out: a bounded loop that fails
    // to advance the modal is indistinguishable from a flow that never
    // progressed. The helper returns only once every named id reports success.
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'reclaim'),
      transferTxId(name, 'transfer-erc721'),
    ])

    // THE ORACLE, and the reason this scenario exists. Both halves must move.
    await expect
      .poll(async () => (await readRegistrant(label)).toLowerCase(), {
        message: 'the ERC-721 registrant must move to the recipient',
        timeout: 90_000,
      })
      .toBe(recipient.toLowerCase())
    await expect
      .poll(async () => (await readController(name)).toLowerCase(), {
        message:
          'and the legacy-registry controller must move too — otherwise the old owner keeps the ability to rewrite every record',
        timeout: 90_000,
      })
      .toBe(recipient.toLowerCase())
  })

  test('refuses a V1 name the wallet manages but does not own, naming the registrant', {
    tag: ['@scenario:F24'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const controller = accounts.getAddress('user')
    const registrant = accounts.getAddress('user2')
    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })
    const name = await makeV1Name({ label: 'v1-xfer-f24', type: 'unwrapped' })
    const label = name.replace(/\.eth$/, '')

    // Split the two halves apart: hand the ERC-721 to user2 while leaving the
    // legacy-registry controller as user. `safeTransferFrom` on the registrar
    // does NOT touch the registry — which is exactly why this state is
    // reachable, and why `reclaim` exists as a separate call.
    const hash = await getOwnerClient(
      accounts.getPrivateKey('user'),
    ).sendTransaction({
      to: V1_BASE_REGISTRAR,
      data: encodeFunctionData({
        abi: V1_BASE_REGISTRAR_ABI,
        functionName: 'safeTransferFrom',
        args: [controller, registrant, tokenIdFor(label)],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash })

    expect(
      (await readRegistrant(label)).toLowerCase(),
      'precondition: user2 is now the registrant',
    ).toBe(registrant.toLowerCase())
    expect(
      (await readController(name)).toLowerCase(),
      'precondition: while the connected wallet is still only the controller',
    ).toBe(controller.toLowerCase())

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByText(/You manage this name but don’t own it/),
      'a controller who is not the registrant must be refused, not offered the form',
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByPlaceholder('ENS name or address'),
      'and must not be given the form anyway',
    ).toBeHidden()

    // Rendered in full, in a font-mono span — not truncated the way a table
    // cell would be. The card exists to tell you who to go and ask, so the
    // whole address is the point.
    await expect(
      page.getByText(registrant),
      'the card must name the registrant in full so the reader knows who to ask',
    ).toBeVisible({ timeout: 15_000 })
  })

  test('transfers a WRAPPED V1 name in a single ERC-1155 step', {
    tag: ['@scenario:F26'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const owner = accounts.getAddress('user')
    const recipient = accounts.getAddress('user2')
    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })
    // `wrapped`, not `locked`: no CANNOT_UNWRAP, no CANNOT_TRANSFER, so the
    // gate says `ok` and the name is actually movable. F25 covers the same
    // token type when the fuse forbids it.
    const name = await makeV1Name({ label: 'v1-xfer-f26', type: 'wrapped' })
    const tokenId = BigInt(namehash(name))

    expect(
      (await readWrapperOwner(tokenId)).toLowerCase(),
      'precondition: the NameWrapper holds the token for the connected wallet',
    ).toBe(owner.toLowerCase())

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })
    await transferButton.click()

    // ONE step, and that is the point of covering this kind separately. A
    // wrapped name lives entirely in the NameWrapper: the legacy registry's
    // owner is the wrapper contract itself, so there is no controller slot to
    // hand over and no `reclaim` to sequence. Contrast F23, where the
    // unwrapped equivalent needs two writes in a specific order.
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'transfer-erc1155'),
    ])

    await expect
      .poll(async () => (await readWrapperOwner(tokenId)).toLowerCase(), {
        message: 'the ERC-1155 must move to the recipient',
        timeout: 90_000,
      })
      .toBe(recipient.toLowerCase())

    // The registry owner stays the NameWrapper throughout — a plan that also
    // tried to move a controller slot here would be writing to a contract the
    // sender does not control.
    expect(
      (await readController(name)).toLowerCase(),
      'the legacy registry owner must remain the NameWrapper',
    ).toBe(V1_NAME_WRAPPER.toLowerCase())
  })

  test('transfers a V1 REGISTRY subname via setOwner alone', {
    tag: ['@scenario:F27'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const owner = accounts.getAddress('user')
    const recipient = accounts.getAddress('user2')
    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })

    // The parent must be UNWRAPPED: `setSubnodeOwner` is a legacy-registry
    // write, and a wrapped parent's registry owner is the NameWrapper, which
    // this account cannot write through.
    const parent = await makeV1Name({ label: 'v1-xfer-f27', type: 'unwrapped' })
    const name = await makeV1RegistrySubname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: owner,
      parentOwnerAccount: parentAccount,
    })

    expect(
      (await readController(name)).toLowerCase(),
      'precondition: the subname is held directly in the legacy registry',
    ).toBe(owner.toLowerCase())

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })
    await transferButton.click()

    // The fourth and last move path, and the simplest: a registry-only name
    // has no ERC-721 and no ERC-1155 — there is nothing to move but the
    // registry entry itself, so `setOwner` is the whole transfer. Covering it
    // separately matters because it is the one kind where `reclaim` would be
    // meaningless: there is no registrant to reclaim from.
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'set-registry-owner'),
    ])

    await expect
      .poll(async () => (await readController(name)).toLowerCase(), {
        message: 'the legacy-registry owner must move to the recipient',
        timeout: 90_000,
      })
      .toBe(recipient.toLowerCase())

    // The parent is a different registry node and must be untouched — a
    // `setOwner` aimed at the wrong node would hand away the parent instead.
    expect(
      (await readController(parent)).toLowerCase(),
      "transferring a subname must not touch the parent's registry entry",
    ).toBe(owner.toLowerCase())
  })

  test('transfers an unwrapped V1 name you own but do not manage, reclaiming the manager', {
    tag: ['@scenario:F28'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const owner = accounts.getAddress('user')
    const otherManager = accounts.getAddress('user3')
    const recipient = accounts.getAddress('user2')
    const ownerKey = accounts.getPrivateKey('user')
    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(ownerKey),
    })
    const name = await makeV1Name({ label: 'v1-xfer-f28', type: 'unwrapped' })
    const label = name.replace(/\.eth$/, '')

    // Hand the CONTROLLER to a third account, keeping the registrant. The
    // mirror of F24: there you hold the manager and not the token, here you
    // hold the token and not the manager — and unlike F24 this one is
    // transferable, because the registrant is who the registrar asks.
    const hash = await getOwnerClient(ownerKey).sendTransaction({
      to: V1_ENS_REGISTRY,
      data: encodeFunctionData({
        abi: parseAbi(['function setOwner(bytes32 node, address owner)']),
        functionName: 'setOwner',
        args: [namehash(name), otherManager],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash })

    expect(
      (await readRegistrant(label)).toLowerCase(),
      'precondition: you are still the registrant',
    ).toBe(owner.toLowerCase())
    expect(
      (await readController(name)).toLowerCase(),
      'precondition: but somebody else is the manager',
    ).toBe(otherManager.toLowerCase())

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })

    // No record options. `getV1DetachTargets` gates both on `canWriteRecords`,
    // which for a v1-registrar subject means being the CONTROLLER — the
    // PublicResolver authorises the registry owner, not the registrant. So the
    // one thing this owner cannot do is touch the records, and offering either
    // switch would produce a write that reverts.
    await expect(
      page.locator('#transfer-option-setEthAddress'),
      'the registrant cannot write records, so the ETH-address option must not be offered',
    ).toHaveCount(0)
    await expect(
      page.locator('#transfer-option-detachResolver'),
      'nor the resolver detach, for the same reason',
    ).toHaveCount(0)

    await transferButton.click()
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'reclaim'),
      transferTxId(name, 'transfer-erc721'),
    ])

    // THE ORACLE. `reclaim` does real work here, unlike in F23 where the
    // registrant already held the manager: it takes the controller slot back
    // from the third party and hands it to the recipient. A transfer that
    // skipped it would leave that third party managing the recipient's name.
    await expect
      .poll(async () => (await readRegistrant(label)).toLowerCase(), {
        message: 'the registrant must move to the recipient',
        timeout: 90_000,
      })
      .toBe(recipient.toLowerCase())
    await expect
      .poll(async () => (await readController(name)).toLowerCase(), {
        message:
          'and the manager must be reclaimed from the third party onto the recipient — not left where it was',
        timeout: 90_000,
      })
      .toBe(recipient.toLowerCase())
  })

  test('offers the resolver detach when the sender IS the V1 controller', {
    tag: ['@scenario:F29'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const owner = accounts.getAddress('user')
    const recipient = accounts.getAddress('user2')
    const ownerKey = accounts.getPrivateKey('user')
    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(ownerKey),
    })
    const name = await makeV1Name({ label: 'v1-xfer-f29', type: 'unwrapped' })
    const label = name.replace(/\.eth$/, '')

    // A resolver is all `detachResolver` needs. An addr(60) — which
    // `setEthAddress` additionally requires — cannot be written on this fork:
    // V1_PUBLIC_RESOLVER.setAddr reverts for the registry owner, through both
    // the fixture and ensjs. Recorded as V1-F4; it blocks the positive
    // set-eth-addr case for V1, not this one.
    const hash = await getOwnerClient(ownerKey).sendTransaction({
      to: V1_ENS_REGISTRY,
      data: encodeFunctionData({
        abi: parseAbi(['function setResolver(bytes32 node, address resolver)']),
        functionName: 'setResolver',
        args: [namehash(name), V1_PUBLIC_RESOLVER],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash })

    expect(
      (await readController(name)).toLowerCase(),
      'precondition: the sender is the controller, so the resolver IS writable',
    ).toBe(owner.toLowerCase())

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })

    // The positive half of F28. There the registrant could not write records
    // and no option appeared; here the same account holds the controller slot
    // and a resolver is set, so the detach must be offered. Without this pair,
    // "no options offered" would also pass for a build that never offered any.
    await expect(
      page.locator('#transfer-option-detachResolver'),
      'a controller CAN detach the resolver, so the option must be offered',
    ).toBeVisible({ timeout: 30_000 })

    // No addr(60) on this name, so `hasEthAddress` is false and the option is
    // correctly withheld — a different reason from F28's, same outcome.
    await expect(
      page.locator('#transfer-option-setEthAddress'),
      'with no addr(60) there is nothing to repoint',
    ).toHaveCount(0)

    // `detachRegistry` is V2-only: `getV1DetachTargets` hardcodes it false
    // because a V1 name has no subregistry. Offering it would plan a step with
    // nothing to write.
    await expect(
      page.locator('#transfer-option-detachRegistry'),
      'a V1 name has no subregistry, so this must never appear',
    ).toHaveCount(0)

    await transferButton.click()
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'detach-resolver'),
      transferTxId(name, 'reclaim'),
      transferTxId(name, 'transfer-erc721'),
    ])

    await expect
      .poll(async () => (await readRegistrant(label)).toLowerCase(), {
        message: 'the name must still transfer after the detach',
        timeout: 90_000,
      })
      .toBe(recipient.toLowerCase())

    // The detach ran for real: the registry no longer points at a resolver.
    expect(
      (
        await publicClient.readContract({
          address: V1_ENS_REGISTRY,
          abi: parseAbi([
            'function resolver(bytes32 node) view returns (address)',
          ]),
          functionName: 'resolver',
          args: [namehash(name)],
        })
      ).toLowerCase(),
      'the resolver must be cleared, not merely reported as detached',
    ).toBe(zeroAddress.toLowerCase())
  })

  test('lets the parent owner reassign an unwrapped V1 subname it does not hold', {
    tag: ['@scenario:F30'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const parentOwner = accounts.getAddress('user')
    const childOwner = accounts.getAddress('user3')
    const recipient = accounts.getAddress('user2')
    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })

    const parent = await makeV1Name({ label: 'v1-xfer-f30', type: 'unwrapped' })
    // Issued to somebody else. The connected wallet holds nothing on the child;
    // its only power is `setSubnodeOwner` on the parent node.
    const name = await makeV1RegistrySubname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: childOwner,
      parentOwnerAccount: parentAccount,
    })

    expect(
      (await readController(name)).toLowerCase(),
      'precondition: the subname belongs to a third account',
    ).toBe(childOwner.toLowerCase())
    expect(
      (await readController(parent)).toLowerCase(),
      'precondition: while the connected wallet owns the parent',
    ).toBe(parentOwner.toLowerCase())

    // Until #1144 this asserted "Not authorized": the gate looked only at
    // `subject.owner`, and this test pinned that as a deliberate difference
    // from ens-app-v3, which lets a parent send a subname via
    // `setSubnodeOwner`. #1144 closes the difference, so the oracle flips —
    // the entry point and the route must now BOTH offer the move.
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    const transferLink = page.getByRole('link', { name: 'Transfer' })
    await expect(
      transferLink,
      "the parent's owner can move it, so the Ownership tab must say so",
    ).toBeVisible({ timeout: 60_000 })
    await transferLink.click()

    const warning = reassignWarning(page)
    await expect(warning).toBeVisible({ timeout: 60_000 })
    const warningText = (await warning.textContent()) ?? ''
    expect(warningText).toContain(`as the owner of ${parent}`)
    expect(
      warningText,
      'the warning must name the holder who loses the name without signing',
    ).toContain(truncateAddress(childOwner))
    expect(warningText).toContain('loses it the moment this lands')

    await expect(page.locator('#transfer-option-setEthAddress')).toHaveCount(0)
    await expect(page.locator('#transfer-option-detachResolver')).toHaveCount(0)

    await page.getByPlaceholder('ENS name or address').fill(recipient)
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })
    await transferButton.click()

    // One step whatever was asked: the plan drops every config step when the
    // parent acts, since it could write none of them.
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'set-subnode-owner'),
    ])

    await expect
      .poll(async () => (await readController(name)).toLowerCase(), {
        message: 'the registry subname must move to the recipient',
        timeout: 90_000,
      })
      .toBe(recipient.toLowerCase())
    expect(
      (await readController(parent)).toLowerCase(),
      "reassigning a subname must not touch the parent's registry entry",
    ).toBe(parentOwner.toLowerCase())
  })

  test('transfers a WRAPPED V1 subname held by its owner', {
    tag: ['@scenario:F31'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const owner = accounts.getAddress('user')
    const recipient = accounts.getAddress('user2')
    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })

    // The parent must be wrapped for `setSubnodeOwner` through the NameWrapper
    // to produce a wrapped child.
    const parent = await makeV1Name({ label: 'v1-xfer-f31', type: 'wrapped' })
    const name = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: owner,
      parentOwnerAccount: parentAccount,
    })
    const tokenId = BigInt(namehash(name))

    expect(
      (await readWrapperOwner(tokenId)).toLowerCase(),
      'precondition: the wrapper holds the subname for the connected wallet',
    ).toBe(owner.toLowerCase())

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })
    await transferButton.click()

    // Same single ERC-1155 move as F26's 2LD: to the wrapper a name is a name,
    // whatever its depth. Covering the subname separately is about the gate,
    // not the write — a wrapped subname is the one V1 subname shape that is
    // transferable at all, since F30's registry subname refuses anyone but its
    // own owner and this one has a real token behind it.
    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'transfer-erc1155'),
    ])

    await expect
      .poll(async () => (await readWrapperOwner(tokenId)).toLowerCase(), {
        message: 'the subname ERC-1155 must move to the recipient',
        timeout: 90_000,
      })
      .toBe(recipient.toLowerCase())

    // The parent is a different wrapper token and must be untouched.
    expect(
      (await readWrapperOwner(BigInt(namehash(parent)))).toLowerCase(),
      "transferring a subname must not move the parent's token",
    ).toBe(owner.toLowerCase())
  })

  test('transfers an EMANCIPATED V1 subname, which its parent can no longer reclaim', {
    tag: ['@scenario:F32'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const owner = accounts.getAddress('user')
    const recipient = accounts.getAddress('user2')
    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })

    const parent = await makeV1Name({ label: 'v1-xfer-f32', type: 'locked' })
    // PARENT_CANNOT_CONTROL: the parent has given up the ability to reclaim or
    // re-issue this child. That is what distinguishes it from F31, where the
    // parent could still take the name back — and it is the V1 analogue of the
    // question #1120's parent-authority warning answers for V2 subnames.
    const name = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: owner,
      parentOwnerAccount: parentAccount,
      fuses: CHILD_FUSES.EMANCIPATED,
    })
    const tokenId = BigInt(namehash(name))

    expect(
      (await readWrapperOwner(tokenId)).toLowerCase(),
      'precondition: the emancipated subname is held by the connected wallet',
    ).toBe(owner.toLowerCase())

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)

    // `getV1ParentPowers` returns empty for a 2LD by design, but an
    // emancipated subname is the case where it should also be empty for a
    // SUBNAME — the parent genuinely retains nothing. If a warning about
    // parent authority appears here it is false, and worse than no warning:
    // it would tell the recipient their name is reclaimable when it is not.
    await expect(
      page.getByPlaceholder('ENS name or address'),
      'an emancipated subname is transferable by its owner',
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page.locator('[role="alert"]', { hasText: /take it back|re-?issue/i }),
      'an emancipated parent retains nothing, so no reclaim warning may be shown',
    ).toHaveCount(0)

    await page.getByPlaceholder('ENS name or address').fill(recipient)
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })
    await transferButton.click()

    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'transfer-erc1155'),
    ])

    await expect
      .poll(async () => (await readWrapperOwner(tokenId)).toLowerCase(), {
        message: 'the emancipated subname must move to the recipient',
        timeout: 90_000,
      })
      .toBe(recipient.toLowerCase())
  })

  test('names the registrant as owner on the Ownership tab (E2E-011)', {
    tag: ['@scenario:F33'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)

    await connectWithHeadlessWallet(page, wallet)

    const controller = accounts.getAddress('user')
    const registrant = accounts.getAddress('user2')
    const ownerKey = accounts.getPrivateKey('user')
    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(ownerKey),
    })
    const name = await makeV1Name({ label: 'v1-own-e2e011', type: 'unwrapped' })
    const label = name.replace(/\.eth$/, '')

    // The same split F24 uses: the ERC-721 to user2, the registry controller
    // left with the connected wallet.
    const hash = await getOwnerClient(ownerKey).sendTransaction({
      to: V1_BASE_REGISTRAR,
      data: encodeFunctionData({
        abi: parseAbi([
          'function safeTransferFrom(address from, address to, uint256 tokenId)',
        ]),
        functionName: 'safeTransferFrom',
        args: [controller, registrant, BigInt(labelhash(label))],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash })

    expect((await readRegistrant(label)).toLowerCase()).toBe(
      registrant.toLowerCase(),
    )
    expect((await readController(name)).toLowerCase()).toBe(
      controller.toLowerCase(),
    )

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    await expect(page.getByText('Owner', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })

    // THE ORACLE. For a V1 name the registrant IS the owner — it holds the
    // ERC-721, and it is the only account the registrar will let transfer the
    // name. The tab instead prints the controller in both the Owner and the
    // Manager row, so the real owner appears nowhere and a non-owner is
    // labelled "Owner". The transfer route reads the same name correctly (F24
    // asserts it names the registrant), so the data is plainly reachable.
    await expect(
      page.getByText(truncateAddress(registrant)),
      'E2E-011: the Ownership tab must name the registrant as the owner of a ' +
        'V1 name — it currently shows the controller in both rows, so whoever ' +
        'actually owns the name is not on the page at all',
    ).toBeVisible({ timeout: 30_000 })
  })

  test('refuses a wrapped V1 name with CANNOT_TRANSFER burnt', {
    tag: ['@scenario:F25'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })
    // `locked` forces CANNOT_UNWRAP; CANNOT_TRANSFER is the fuse under test.
    const name = await makeV1Name({
      label: 'v1-xfer-f25',
      type: 'locked',
      fuses: FUSES.CANNOT_TRANSFER,
    })

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByText('Transfer permanently disabled'),
      'a burnt CANNOT_TRANSFER fuse is irreversible, and the copy must say so rather than offering a form that would revert',
    ).toBeVisible({ timeout: 60_000 })
    await expect(page.getByPlaceholder('ENS name or address')).toBeHidden()

    // The entry point must agree with the route. A Transfer link that leads to
    // a refusal is the shape E2E-001 was about.
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    await expect(
      page.getByRole('link', { name: 'Transfer' }),
      'the Ownership tab must not offer a transfer the route will refuse',
    ).toHaveCount(0)
  })

  // ── #1144 (WEB-1407): a V1 subname moved by its PARENT ────────────────────
  //
  // Everything above moves a name as its holder. #1144 adds the second actor:
  // the parent's owner, who can `setSubnodeOwner` the child out from under its
  // holder — `ENSRegistry.setSubnodeOwner` for an unwrapped child,
  // `NameWrapper.setSubnodeOwner` for a wrapped one. That is what ens-app-v3
  // has always offered (`transferName` with `asParent`), and it is why F30's
  // oracle flipped. The holder signs nothing and loses the name, so the
  // warning naming them is the whole safety story for this path.

  const V1_WRAPPER_ABI = parseAbi([
    'function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)',
    'function unwrap(bytes32 parentNode, bytes32 labelhash, address controller)',
  ])

  const readWrapperData = async (tokenId: bigint) => {
    const [owner, fuses, expiry] = await publicClient.readContract({
      address: V1_NAME_WRAPPER,
      abi: V1_WRAPPER_ABI,
      functionName: 'getData',
      args: [tokenId],
    })
    return { owner, fuses, expiry }
  }

  /** Send `data` to `to` as `account`, and fail loudly if it reverts. */
  const sendAs = async (
    account: ReturnType<typeof privateKeyToAccount>,
    to: Address,
    data: Hash,
    what: string,
  ) => {
    const hash = await walletClient.sendTransaction({ account, to, data })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`${what} reverted`)
  }

  /** `ENSRegistry.setOwner` — hand a registry node to somebody else. */
  const setRegistryOwner = (
    account: ReturnType<typeof privateKeyToAccount>,
    name: string,
    owner: Address,
  ) =>
    sendAs(
      account,
      V1_ENS_REGISTRY,
      encodeFunctionData({
        abi: parseAbi(['function setOwner(bytes32 node, address owner)']),
        functionName: 'setOwner',
        args: [namehash(name), owner],
      }),
      `setOwner(${name})`,
    )

  /** The warning `V1Notices` shows only when the parent is the one acting. */
  const reassignWarning = (page: Page) =>
    page.locator('[role="alert"]', {
      hasText: 'reassigning this subname as the owner of',
    })

  /**
   * The route renders a refusal card and nothing else: no recipient field,
   * and the Ownership tab offers no link that leads to it (the E2E-001 shape).
   */
  const expectRefusal = async (page: Page, name: string, title: RegExp) => {
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(page.getByText(title)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByPlaceholder('ENS name or address')).toHaveCount(0)
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    await expect(
      page.getByRole('link', { name: 'Transfer' }),
      'the Ownership tab must not offer a transfer the route will refuse',
    ).toHaveCount(0)
  }

  test('lets the parent owner reassign a WRAPPED V1 subname, keeping its fuses and expiry', {
    tag: ['@scenario:F34'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const parentOwner = accounts.getAddress('user')
    const childOwner = accounts.getAddress('user3')
    const recipient = accounts.getAddress('user2')
    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })

    const parent = await makeV1Name({ label: 'v1-xfer-f34', type: 'wrapped' })
    const name = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: childOwner,
      parentOwnerAccount: parentAccount,
    })
    const tokenId = BigInt(namehash(name))
    const before = await readWrapperData(tokenId)
    expect(
      before.owner.toLowerCase(),
      'precondition: a third account holds the wrapped subname',
    ).toBe(childOwner.toLowerCase())

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    const transferLink = page.getByRole('link', { name: 'Transfer' })
    await expect(
      transferLink,
      "the parent's owner can move it, so the Ownership tab must say so",
    ).toBeVisible({ timeout: 60_000 })
    await transferLink.click()

    const warning = reassignWarning(page)
    await expect(warning).toBeVisible({ timeout: 60_000 })
    const warningText = (await warning.textContent()) ?? ''
    expect(warningText).toContain(`as the owner of ${parent}`)
    expect(
      warningText,
      'the warning must name the holder who loses the name without signing',
    ).toContain(truncateAddress(childOwner))

    // A parent holds neither the child's registry slot nor its wrapper token,
    // so it cannot write the child's records: no option may be offered.
    await expect(page.locator('#transfer-option-setEthAddress')).toHaveCount(0)
    await expect(page.locator('#transfer-option-detachResolver')).toHaveCount(0)

    await page.getByPlaceholder('ENS name or address').fill(recipient)
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 60_000 })
    await transferButton.click()

    await driveTransactionsToSuccess(page, wallet, [
      transferTxId(name, 'set-subnode-owner'),
    ])

    await expect
      .poll(async () => (await readWrapperOwner(tokenId)).toLowerCase(), {
        message: 'the wrapped subname must move to the recipient',
        timeout: 90_000,
      })
      .toBe(recipient.toLowerCase())

    // `prepareReassignV1SubnameTransaction` passes 0 fuses and 0 expiry and
    // relies on the wrapper keeping what is there: `_updateName` ORs the
    // fuses and `_normaliseExpiry` never lowers the expiry. Checked here
    // because getting it wrong would be silent — a reassigned subname that
    // quietly lost its expiry or its fuses.
    const after = await readWrapperData(tokenId)
    expect(after.fuses, 'reassigning must not change the fuses').toBe(
      before.fuses,
    )
    expect(after.expiry, 'reassigning must not change the expiry').toBe(
      before.expiry,
    )
    expect(
      (await readWrapperOwner(BigInt(namehash(parent)))).toLowerCase(),
      "reassigning a subname must not move the parent's token",
    ).toBe(parentOwner.toLowerCase())
  })

  test('refuses the parent owner a V1 subname that burned PARENT_CANNOT_CONTROL', {
    tag: ['@scenario:F35'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })
    const parent = await makeV1Name({ label: 'v1-xfer-f35', type: 'locked' })
    const name = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: accounts.getAddress('user3'),
      parentOwnerAccount: parentAccount,
      fuses: CHILD_FUSES.EMANCIPATED,
    })

    // The wrapper's `canCallSetSubnodeOwner` refuses a child with PCC burned,
    // so the gate must refuse before the reassign is ever built.
    await expectRefusal(
      page,
      name,
      /This subname is out of the parent.s control/,
    )
  })

  test('refuses to reassign across the wrapper line: a wrapped parent over an unwrapped subname', {
    tag: ['@scenario:F36'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const parentOwner = accounts.getAddress('user')
    const childOwner = accounts.getAddress('user3')
    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })

    const parent = await makeV1Name({ label: 'v1-xfer-f36', type: 'wrapped' })
    const name = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: parentOwner,
      parentOwnerAccount: parentAccount,
    })
    // Unwrap the child onto a third account: the parent stays wrapped, the
    // child is now a plain registry node. Reassigning it through the wrapper
    // would forcibly re-wrap it, which the legacy app also refuses to do.
    await sendAs(
      parentAccount,
      V1_NAME_WRAPPER,
      encodeFunctionData({
        abi: V1_WRAPPER_ABI,
        functionName: 'unwrap',
        args: [namehash(parent), labelhash('sub'), childOwner],
      }),
      `unwrap(${name})`,
    )
    expect(
      (await readController(name)).toLowerCase(),
      'precondition: the subname is a registry node held by a third account',
    ).toBe(childOwner.toLowerCase())
    expect(
      (await readWrapperOwner(BigInt(namehash(parent)))).toLowerCase(),
      'precondition: while the connected wallet holds the WRAPPED parent',
    ).toBe(parentOwner.toLowerCase())

    await expectRefusal(page, name, /Can.t reassign this subname from here/)
  })

  test('tells the registrant of an unwrapped parent to reclaim it before reassigning', {
    tag: ['@scenario:F37'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const parentOwner = accounts.getAddress('user')
    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })

    const parent = await makeV1Name({ label: 'v1-xfer-f37', type: 'unwrapped' })
    const name = await makeV1RegistrySubname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: accounts.getAddress('user3'),
      parentOwnerAccount: parentAccount,
    })
    // Hand the parent's CONTROLLER away, keeping its ERC-721. The registrar
    // still says the connected wallet owns the parent, but `setSubnodeOwner`
    // is a registry write and needs the controller.
    await setRegistryOwner(parentAccount, parent, accounts.getAddress('user2'))
    expect(
      (await readRegistrant(parent.replace(/\.eth$/, ''))).toLowerCase(),
      'precondition: the connected wallet is still the registrant of the parent',
    ).toBe(parentOwner.toLowerCase())

    await expectRefusal(page, name, /Reclaim the parent first/)
  })

  test('refuses at submit when the wallet stopped being the parent actor after the form loaded', {
    tag: ['@scenario:F38'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const parentOwner = accounts.getAddress('user')
    const childOwner = accounts.getAddress('user3')
    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const childAccount = privateKeyToAccount(accounts.getPrivateKey('user3'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })

    const parent = await makeV1Name({ label: 'v1-xfer-f38', type: 'unwrapped' })
    const name = await makeV1RegistrySubname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: childOwner,
      parentOwnerAccount: parentAccount,
    })

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(reassignWarning(page)).toBeVisible({ timeout: 60_000 })
    await page
      .getByPlaceholder('ENS name or address')
      .fill(accounts.getAddress('user2'))

    // Between render and submit the holder hands the subname to the connected
    // wallet. The page still shows the PARENT's form (one `setSubnodeOwner`,
    // no record options); the wallet is now the holder, whose move is a
    // different contract call. The submit path re-reads and re-gates, and
    // must refuse rather than send the parent plan under the holder's role.
    await setRegistryOwner(childAccount, name, parentOwner)

    await page.getByRole('button', { name: 'Transfer name' }).click()
    await expect(
      page.getByText(/How this name is held changed since the page loaded/),
      'a plan built for one role must not be sent under the other',
    ).toBeVisible({ timeout: 60_000 })
    expect(
      (await readController(name)).toLowerCase(),
      'and nothing may have been sent',
    ).toBe(parentOwner.toLowerCase())
  })

  // The two cards below each end by telling the user where to go next. A
  // refusal is only useful if that instruction can be followed, so these
  // follow it — and neither destination exists for a V1 name.

  test('the "Reclaim the parent first" card names a control the Ownership page actually offers', {
    tag: ['@scenario:F37'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })
    const parent = await makeV1Name({
      label: 'v1-xfer-e012',
      type: 'unwrapped',
    })
    const name = await makeV1RegistrySubname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: accounts.getAddress('user3'),
      parentOwnerAccount: parentAccount,
    })
    await setRegistryOwner(parentAccount, parent, accounts.getAddress('user2'))

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(page.getByText(/Reclaim the parent first/)).toBeVisible({
      timeout: 60_000,
    })
    // The card names the control and the page it lives on. Asserted as the
    // pair, because either half alone is satisfiable by a card that sends the
    // user somewhere useless — which is what E2E-012 was.
    await expect(
      page.getByText(/Reclaim manager/),
      'precondition: the card names the control to use',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByText(/Ownership page/),
      'precondition: the card says where that control lives',
    ).toBeVisible()

    // Follow the instruction to the letter and prove it lands somewhere real.
    await page.goto(`${PORTAL_APP_URL}/${parent}/ownership`)
    await expect(
      page.getByRole('heading', { name: 'Ownership' }).first(),
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page
        .getByRole('button', { name: /reclaim/i })
        .or(page.getByRole('link', { name: /reclaim/i })),
      'the page the card names must offer the reclaim it tells the user to do',
    ).toBeVisible({ timeout: 30_000 })
  })

  test('the emancipated card sends the parent to the ENS Manager, not to a page that cannot create V1 subnames', {
    tag: ['@scenario:F35'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)

    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })
    const parent = await makeV1Name({ label: 'v1-xfer-e013', type: 'locked' })
    const name = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: accounts.getAddress('user3'),
      parentOwnerAccount: parentAccount,
      fuses: CHILD_FUSES.EMANCIPATED,
    })

    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByText(/only its own owner can move it/),
      'precondition: the emancipated-subname card is the one being shown',
    ).toBeVisible({ timeout: 60_000 })

    // The portal's own Subnames page is read-only for a V1 parent, so naming it
    // here is an instruction that dead-ends. That was E2E-013.
    await expect(
      page.getByText(/Subnames page/),
      'the card must not send a V1 parent to a page that cannot create V1 subnames',
    ).toHaveCount(0)

    // Where it does point has to be somewhere the label can actually be
    // re-issued, which for a V1 parent is ens-app-v3, not this app.
    await expect(
      page.getByRole('link', { name: 'Open in ENS Manager' }),
      'the card must offer the route that can re-issue the label',
    ).toBeVisible({ timeout: 30_000 })
  })

  test('says which subname does not exist, rather than calling it unregistered', {
    tag: ['@scenario:F40'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(240_000)
    await connectWithHeadlessWallet(page, wallet)

    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })
    const parent = await makeV1Name({ label: 'v1-xfer-f40', type: 'unwrapped' })

    await page.goto(`${PORTAL_APP_URL}/nope.${parent}/ownership/transfer`)
    await expect(page.getByText('Transfer not available')).toBeVisible({
      timeout: 60_000,
    })
    await expect(
      page.getByText(`doesn’t exist under ${parent}`, { exact: false }),
      'a missing subname names the parent it is missing from',
    ).toBeVisible()
    await expect(page.getByPlaceholder('ENS name or address')).toHaveCount(0)
  })

  // Last in the file on purpose: the time travel is contained by a chain
  // snapshot, and reverting one leaves Panoptes unable to recover (see
  // fixtures/chain-snapshot.ts). Nothing after it may need the indexer.

  /**
   * A wrapped `.eth` 2LD you own, one subname you HOLD and one you are only
   * the PARENT of, with the clock pushed 29 days into the 2LD's grace period.
   * 28 days is the registrar's minimum, so the jumps stay short.
   */
  const seedAncestorInGrace = async (
    accounts: { getAddress: (u: 'user' | 'user3') => Address },
    parentAccount: ReturnType<typeof privateKeyToAccount>,
    label: string,
  ) => {
    const DAY = 86_400
    const makeV1Name = createMakeV1Name({ userAccount: parentAccount })
    const parent = await makeV1Name({
      label,
      type: 'wrapped',
      duration: 28 * DAY,
    })
    const parentLabel = parent.replace(/\.eth$/, '')
    const held = await makeV1Subname({
      parentName: parentLabel,
      childLabel: 'held',
      ownerAddress: accounts.getAddress('user'),
      parentOwnerAccount: parentAccount,
    })
    const other = await makeV1Subname({
      parentName: parentLabel,
      childLabel: 'other',
      ownerAddress: accounts.getAddress('user3'),
      parentOwnerAccount: parentAccount,
    })
    await testClient.increaseTime({ seconds: 29 * DAY })
    await testClient.mine({ blocks: 1 })
    return { parent, held, other, DAY }
  }

  test('gates V1 subnames on the .eth 2LD above: the holder moves through grace, nobody moves past it', {
    tag: ['@scenario:F39'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(480_000)
    await connectWithHeadlessWallet(page, wallet)
    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))

    await withChainSnapshot(async () => {
      const { parent, held, other, DAY } = await seedAncestorInGrace(
        accounts,
        parentAccount,
        'v1-xfer-f39',
      )

      // The holder's own move still goes through — the child's wrapper expiry
      // is the parent's plus grace — but into a subtree about to lapse.
      await page.goto(`${PORTAL_APP_URL}/${held}/ownership/transfer`)
      await expect(
        page.getByPlaceholder('ENS name or address'),
        'grace on the ancestor does not block the holder',
      ).toBeVisible({ timeout: 60_000 })
      const graceNotice = page.locator('[role="alert"]', {
        hasText: 'is in its grace period',
      })
      await expect(graceNotice).toBeVisible()
      expect((await graceNotice.textContent()) ?? '').toContain(
        'whoever registers it next can take this subname back',
      )

      // Past grace: whoever registers the 2LD next controls every name under
      // it, so there is nothing lasting to hand over — for either actor.
      await testClient.increaseTime({ seconds: 91 * DAY })
      await testClient.mine({ blocks: 1 })
      for (const name of [held, other]) {
        await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
        await expect(
          page.getByText(`${parent} has expired`),
          `${name}: an expired .eth ancestor blocks every move`,
        ).toBeVisible({ timeout: 60_000 })
        await expect(page.getByPlaceholder('ENS name or address')).toHaveCount(
          0,
        )
      }
    })
  })

  test('tells the owner of a wrapped 2LD in grace why it cannot reassign a subname (E2E-014)', {
    tag: ['@scenario:F39'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(420_000)
    await connectWithHeadlessWallet(page, wallet)
    const parentAccount = privateKeyToAccount(accounts.getPrivateKey('user'))

    await withChainSnapshot(async () => {
      const { parent, other } = await seedAncestorInGrace(
        accounts,
        parentAccount,
        'v1-xfer-e014',
      )
      expect(
        (await readWrapperOwner(BigInt(namehash(parent)))).toLowerCase(),
        'precondition: the NameWrapper still reports the connected wallet as the 2LD owner in grace',
      ).toBe(accounts.getAddress('user').toLowerCase())

      // The wrapper refuses `setSubnodeOwner` from a 2LD in grace, so the
      // parent's move must be refused up front — with the reason, and the way
      // out (renew), which is what #1144's `ancestor-grace` card is for.
      await page.goto(`${PORTAL_APP_URL}/${other}/ownership/transfer`)
      await expect(
        page.getByText('Not authorized'),
        'the owner of the 2LD must not be told they are not authorized',
      ).toHaveCount(0, { timeout: 60_000 })
      await expect(
        page.getByText(`${parent} is in its grace period`),
        'a parent in grace is refused with the grace card and a way to renew',
      ).toBeVisible({ timeout: 60_000 })
    })
  })
})
