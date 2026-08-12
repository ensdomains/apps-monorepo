import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getAddressRecord } from '@ensdomains/ensjs/public'
import { hasRoles } from '@ensdomains/ensjs/public/v2'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { setRecords } from '@ensdomains/ensjs/wallet'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2'
import type { Page } from '@playwright/test'
import {
  type Address,
  createWalletClient,
  type Hash,
  http,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { withChainSnapshot } from '../../../fixtures/chain-snapshot.js'
import {
  registerSubname as createSubname,
  attachSubregistry as deployAndAttachSubregistry,
} from '../../../fixtures/makeSubname.js'
import { FUSES } from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { authorizeTransaction } from '../../../helpers/portal-auth.js'
import {
  assertLacksRoles,
  assertRoleBitmap,
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
/** On-chain ERC-1155 owner of a 2LD in the `.eth` registry. */
function ownerOfName(label: string): Promise<Address> {
  return publicClient.readContract({
    address: ETH_REGISTRY,
    abi: parseAbi(['function ownerOf(uint256 id) view returns (address)']),
    functionName: 'ownerOf',
    args: [labelToCanonicalId(label)],
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
  test('transfers a name from wallet A to wallet B, and wallet B is shown as the owner', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
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
    // shared DEDICATED_RESOLVER), and SendNameForm's "Detach the resolver"
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

  test('transfers a name from wallet A to an ENS name owned by wallet B', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
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

  test('cannot transfer a name to its own address or its own ENS name', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
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

  test('cannot transfer to an invalid or unresolvable recipient', async ({
    portalPage: page,
    wallet,
    makeName,
  }) => {
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

  test('keeps the resolver and registry attached when both detach options are turned off', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
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

    // Both options default to on whenever they have a target — turn both
    // off to exercise the "leave everything as-is" path.
    const detachResolverSwitch = page.getByRole('switch', {
      name: /Detach the resolver/,
    })
    const detachRegistrySwitch = page.getByRole('switch', {
      name: /Detach the registry/,
    })
    await expect(detachResolverSwitch).toBeVisible({ timeout: 15_000 })
    await detachResolverSwitch.click()
    await expect(detachRegistrySwitch).toBeVisible({ timeout: 15_000 })
    await detachRegistrySwitch.click()

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
   * Subname transfers are deliberately **not** offered yet (commit 2be99824b,
   * "enhance transfer logic with subname validation"). Both surfaces gate on
   * `is2LD(name)`, which is false for anything deeper than `label.eth`.
   *
   * Note this is a client-side gate only: the owner of a subname that holds
   * ROLE_CAN_TRANSFER_ADMIN can still move the ERC-1155 token directly on-chain
   * (an earlier revision of this test did exactly that, successfully). The test
   * below therefore asserts what the *UI* offers, not what the chain permits.
   */
  test('does not offer transfer for a subname', {
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

    // ── 1. The Ownership tab offers no entry point ────────────────────
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    await expect(page.getByRole('heading', { name: 'Ownership' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('link', { name: 'Transfer' })).toBeHidden()

    // ── 2. ...and the route itself explains why, with no form ─────────
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(page.getByText('Transfer not available')).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      page.getByText(/Transferring subnames isn’t supported yet/),
    ).toBeVisible()
    await expect(page.getByPlaceholder('ENS name or address')).toBeHidden()

    // ── 3. The parent (a 2LD) is unaffected and still transferable ────
    await page.goto(`${PORTAL_APP_URL}/${parentName}/ownership`)
    await expect(page.getByRole('link', { name: 'Transfer' })).toBeVisible({
      timeout: 30_000,
    })
  })

  test('repoints the ETH address at the recipient when the resolver is kept', {
    tag: ['@scenario:F12'],
  }, async ({ portalPage: page, wallet, accounts, makeName }) => {
    test.setTimeout(240_000)

    await connectWithHeadlessWallet(page, wallet)

    // A dedicated resolver proxy (deployed because `records` is non-empty) is
    // required — the shared DEDICATED_RESOLVER doesn't grant this owner write
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
})

// ---------------------------------------------------------------------------
// Guard / validation states that never reach the chain
// ---------------------------------------------------------------------------
test.describe('Portal name transfer — guards', () => {
  test('rejects the zero address as a recipient', async ({
    portalPage: page,
    wallet,
    makeName,
  }) => {
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

  test('accepts a recipient address with surrounding whitespace', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
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

  test('shows "Not authorized" to a wallet that does not own the name', async ({
    portalPage: page,
    wallet,
    makeName,
  }) => {
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

  test('asks a disconnected visitor to connect their wallet', async ({
    portalPage: page,
    makeName,
  }) => {
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
    tag: ['@scenario:F7'],
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
      page.getByText('Transfer not available'),
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
