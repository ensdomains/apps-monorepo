/**
 * After a V2 name is transferred away, what does each party see in the
 * manager? (e2e-gap-analysis.md §1, scenarios X4 and R8.)
 *
 * The transfer itself is covered in the explorer (`portal/tests/transfer.spec.ts`).
 * These tests make the same on-chain transfer and then look from the other
 * side: the previous owner's My Names, profile and primary-name picker.
 *
 * Oracles, from contracts-v2 and the UniversalResolver:
 * - a transfer moves every registry role the sender holds to the recipient
 *   (`PermissionedRegistry._update` → `_transferRoles`), so the sender holds
 *   nothing on the name and it must leave the sender's list;
 * - record writes on a PermissionedResolver are gated by roles on the
 *   resolver, not by the token: a sender who keeps their resolver attached
 *   can still edit, and a name whose `addr(60)` is the sender is a valid
 *   primary name for them (ens-app-v3 offers such names too:
 *   `checkAvailablePrimaryName.ts`, `setPrimary.spec.ts`).
 *
 * Real index only: the point is what bigname reports after a real transfer.
 */
import { setRecords } from '@ensdomains/ensjs/wallet/v2'
import type { Page } from '@playwright/test'
import { type Address, createWalletClient, http, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import {
  isRealBigname,
  waitForBignameBlock,
} from '../../../helpers/bigname-sync.js'
import { openPrimaryNamePicker } from '../../../helpers/primary-name.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import { readV2Holding, transferV2Name } from '../../../helpers/v2-transfer.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const labelOf = (name: string) => name.replace(/\.eth$/, '')

/** My Names on the dashboard, filtered to `name`. */
async function dashboardRow(page: Page, name: string) {
  await page.goto(`${MANAGER_APP_URL}/dashboard`)
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('Search my names').fill(name)
  return page.getByRole('link', { name, exact: true })
}

/** The primary-name picker, searched for `name`. */
async function primaryPicker(page: Page, owner: Address, name: string) {
  const dialog = await openPrimaryNamePicker(page, owner)
  await dialog.getByPlaceholder('Search names').fill(labelOf(name))
  return dialog
}

type Signer = ReturnType<typeof privateKeyToAccount>

/**
 * Write records on `resolver` as `signer`, through ensjs — the deployed
 * PermissionedResolver's setters take the DNS-encoded name, not a node.
 */
async function writeRecords(
  signer: Signer,
  name: string,
  resolver: Address,
  records: Omit<Parameters<typeof setRecords>[1], 'name' | 'resolverAddress'>,
) {
  const client = createWalletClient({
    account: signer,
    chain: walletClient.chain,
    transport: http(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'),
  })
  const hash = await setRecords(client, {
    name,
    resolverAddress: resolver,
    ...records,
  } as Parameters<typeof setRecords>[1])
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  expect(receipt.status, `record write on ${name} by ${signer.address}`).toBe(
    'success',
  )
}

/** Point the name's ETH record at `owner`, on the name's own resolver. */
async function setEthRecord(name: string, owner: Signer): Promise<Address> {
  const { resolver } = await readV2Holding(labelOf(name), owner.address)
  await writeRecords(owner, name, resolver, {
    coins: [{ coin: 60, value: owner.address }],
  })
  return resolver
}

test.describe('After a V2 transfer, the previous owner in the manager', () => {
  test.describe.configure({ timeout: 240_000 })
  test.skip(
    !isRealBigname,
    'needs the real index: the mock reports whatever relations the test gives it',
  )

  test('a name transferred away with its resolver detached leaves My Names', {
    tag: ['@scenario:X4'],
  }, async ({ profileConnectedPage: page, makeV2Name, accounts }) => {
    const a = privateKeyToAccount(accounts.getPrivateKey('user'))
    const b = accounts.getAddress('user3') as Address
    const name = await makeV2Name({ label: 'x4-detach' })
    const control = await makeV2Name({ label: 'x4-control' })

    await transferV2Name({
      label: labelOf(name),
      from: a,
      to: b,
      detachResolver: true,
    })
    // On chain: B holds the token and A holds no registry role on it.
    const forA = await readV2Holding(labelOf(name), a.address)
    expect(forA.owner.toLowerCase()).toBe(b.toLowerCase())
    expect(forA.roles, 'A keeps no registry role after the transfer').toBe(0n)
    expect(forA.resolver).toBe(zeroAddress)
    await waitForBignameBlock()

    // Control: a name A still owns is listed, so the page has its data.
    await expect(await dashboardRow(page, control)).toBeVisible({
      timeout: 30_000,
    })
    // The recipient's public profile lists it as theirs.
    await page.goto(`${MANAGER_APP_URL}/${b}`)
    await page.getByPlaceholder('Search names').fill(name)
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })

    // E2E-033 (manual, Sepolia): the hosted bigname kept the sender under
    // `relation=manager` after this transfer although the name's own record
    // names the recipient. The local bigname gets it right, so this passes
    // here and guards against the manager, or a future index, regressing.
    await expect(
      await dashboardRow(page, name),
      `${name} belongs to ${b} and A holds no role on it`,
    ).toHaveCount(0, { timeout: 15_000 })
  })

  test('a sender who keeps their resolver attached can still edit the profile', {
    tag: ['@scenario:R8'],
  }, async ({ profileConnectedPage: page, makeV2Name, accounts }) => {
    const a = privateKeyToAccount(accounts.getPrivateKey('user'))
    const b = accounts.getAddress('user3') as Address
    const name = await makeV2Name({ label: 'r8-edit' })
    const control = await makeV2Name({ label: 'r8-edit-control' })
    const resolver = await setEthRecord(name, a)

    await transferV2Name({
      label: labelOf(name),
      from: a,
      to: b,
      detachResolver: false,
    })
    // On chain: B holds the token; the resolver is still A's, and A may still
    // write to it (the resolver's own roles, not the token, decide).
    const forA = await readV2Holding(labelOf(name), a.address)
    expect(forA.owner.toLowerCase()).toBe(b.toLowerCase())
    expect(forA.resolver.toLowerCase()).toBe(resolver.toLowerCase())
    await writeRecords(a, name, resolver, {
      texts: [{ key: 'description', value: 'still mine to edit' }],
    })
    await waitForBignameBlock()

    // Control: A's own name offers Edit Profile.
    await page.goto(`${MANAGER_APP_URL}/${control}`)
    await expect(
      page.getByRole('button', { name: 'Edit Profile' }),
    ).toBeVisible({ timeout: 30_000 })

    await page.goto(`${MANAGER_APP_URL}/${name}`)
    await expect(page.getByRole('heading', { name })).toBeVisible({
      timeout: 30_000,
    })
    test.fail(
      true,
      'E2E-034: the manager hides Edit Profile from a sender who can still write the records',
    )
    await expect(
      page.getByRole('button', { name: 'Edit Profile' }),
      'A holds the resolver roles, so A can edit',
    ).toBeVisible({ timeout: 15_000 })
  })

  test('a sender whose ETH record the name keeps can still pick it as primary', {
    tag: ['@scenario:R8'],
  }, async ({ profileConnectedPage: page, makeV2Name, accounts }) => {
    const a = privateKeyToAccount(accounts.getPrivateKey('user'))
    const b = accounts.getAddress('user3') as Address
    const name = await makeV2Name({ label: 'r8-primary' })
    const control = await makeV2Name({ label: 'r8-primary-control' })
    const resolver = await setEthRecord(name, a)

    await transferV2Name({
      label: labelOf(name),
      from: a,
      to: b,
      detachResolver: false,
    })
    // On chain: the name still resolves to A, which is what makes it a valid
    // primary name for A (UniversalResolver reverse check).
    await expectRecordsResolve(name, {
      addresses: [{ coinType: 60, value: a.address }],
    })
    expect(resolver).not.toBe(zeroAddress)
    await waitForBignameBlock()

    // Control: a name A owns is offered.
    const dialog = await primaryPicker(page, a.address, control)
    await expect(
      dialog.getByRole('button', { name: `Select ${control} as primary name` }),
    ).toBeVisible({ timeout: 30_000 })

    await dialog.getByPlaceholder('Search names').fill(labelOf(name))
    test.fail(
      true,
      'E2E-035: the primary-name picker drops a name that still resolves to the sender',
    )
    await expect(
      dialog.getByRole('button', { name: `Select ${name} as primary name` }),
      `${name} resolves to A, so A can set it as primary`,
    ).toBeVisible({ timeout: 15_000 })
  })

  test('a resolver detached by the transfer takes its records off the manager profile', {
    tag: ['@scenario:X14'],
  }, async ({ profileConnectedPage: page, makeV2Name, accounts }) => {
    const a = privateKeyToAccount(accounts.getPrivateKey('user'))
    const b = accounts.getAddress('user3') as Address
    const description = `x14 record ${Date.now().toString(36)}`
    const name = await makeV2Name({
      label: 'x14-detach',
      records: [{ key: 'description', value: description }],
    })

    // Before: the manager has the profile, record and all, loaded — a stale
    // cache would keep showing it.
    await page.goto(`${MANAGER_APP_URL}/${name}`)
    await expect(page.getByText(description)).toBeVisible({ timeout: 30_000 })

    await transferV2Name({
      label: labelOf(name),
      from: a,
      to: b,
      detachResolver: true,
    })
    expect((await readV2Holding(labelOf(name), a.address)).resolver).toBe(
      zeroAddress,
    )
    await waitForBignameBlock()

    await page.reload()
    await expect(page.getByRole('heading', { name })).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      page.getByText(description),
      'the name has no resolver now, so it has no records',
    ).toHaveCount(0, { timeout: 30_000 })
  })
})
