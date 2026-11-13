import { createWalletClient, http, namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_ENS_REGISTRY,
} from '../../../fixtures/makeV1Name.js'
import { makeV1Subname } from '../../../fixtures/makeV1Subname.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

// Each title names the original ledger row. These use actual V1 names and
// preserve the old authorization/validation oracle; no migration is allowed.
const registryAbi = parseAbi([
  'function setOwner(bytes32 node, address owner)',
  'function owner(bytes32 node) view returns (address)',
])

for (const scenario of [
  { id: 'L027', owner: 'user', manager: 'user2', allowed: false },
  { id: 'L028', owner: 'user2', manager: 'user2', allowed: false },
  { id: 'L029', owner: 'user2', manager: 'user', allowed: true },
] as const) {
  test(`${scenario.id} v1 subname creation follows controller authority`, async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    const account = privateKeyToAccount(accounts.getPrivateKey(scenario.owner))
    const name = await createMakeV1Name({ userAccount: account })({
      label: scenario.id.toLowerCase(),
      type: 'unwrapped',
    })
    if (scenario.manager !== scenario.owner) {
      const client = createWalletClient({
        account,
        chain: walletClient.chain,
        transport: http(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'),
      })
      const hash = await client.writeContract({
        address: V1_ENS_REGISTRY,
        abi: registryAbi,
        functionName: 'setOwner',
        args: [namehash(name), accounts.getAddress(scenario.manager)],
      })
      await publicClient.waitForTransactionReceipt({ hash })
    }
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}/subnames`)
    await expect(page.getByText('Failed to load subnames')).toHaveCount(0)
    // Wait for a completed table rather than accepting a hidden loading state.
    await expect(
      page.getByRole('heading', { name: /subnames/i }).first(),
    ).toBeVisible()
    const create = page.getByRole('link', {
      name: 'Create subname',
      exact: true,
    })
    if (scenario.allowed) await expect(create).toBeVisible()
    else {
      await expect(create).toHaveCount(0)
      await page.goto(`/${name}/create-subname`)
      await expect(
        page.getByText('Only its owner can create subnames'),
      ).toBeVisible()
    }
  })
}

test('L030 v1 controller cannot create an invalid label', async ({
  portalPage: page,
  wallet,
  accounts,
}) => {
  const account = privateKeyToAccount(accounts.getPrivateKey('user2'))
  const name = await createMakeV1Name({ userAccount: account })({
    label: 'l030',
    type: 'unwrapped',
  })
  const client = createWalletClient({
    account,
    chain: walletClient.chain,
    transport: http(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'),
  })
  const hash = await client.writeContract({
    address: V1_ENS_REGISTRY,
    abi: registryAbi,
    functionName: 'setOwner',
    args: [namehash(name), accounts.getAddress('user')],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`/${name}/create-subname`)
  await page.locator('#label').fill('invalid name')
  await expect(
    page.getByRole('button', { name: 'Create subname', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByText(/invalid|disallowed|whitespace/i).last(),
  ).toBeVisible()
})

test('L036 v1 create without records — adapted Explorer flow', async ({
  portalPage: page,
  wallet,
  accounts,
}) => {
  const name = await createMakeV1Name({
    userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
  })({ label: 'l036', type: 'unwrapped' })
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`/${name}/create-subname`)
  await page.locator('#label').fill('test')
  await page
    .getByRole('button', { name: 'Create subname', exact: true })
    .click()
  await driveTransactionsToSuccess(page, wallet, ['tx-create-ens-subname'])
  expect(
    (
      await publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi: registryAbi,
        functionName: 'owner',
        args: [namehash(`test.${name}`)],
      })
    ).toLowerCase(),
  ).toBe(accounts.getAddress('user').toLowerCase())
  await waitForBignameBlock()
  await page.goto(`/test.${name}/records`)
  await expect(
    page.getByRole('heading', { name: 'No records set', exact: true }),
  ).toBeVisible()
})

for (const type of ['unwrapped', 'wrapped'] as const) {
  const id = type === 'unwrapped' ? 'L031' : 'L032'
  test(`${id} V1 create child and populate the three legacy profile records`, async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    test.setTimeout(180_000)
    const account = privateKeyToAccount(
      accounts.getPrivateKey(type === 'unwrapped' ? 'user2' : 'user'),
    )
    const name = await createMakeV1Name({ userAccount: account })({
      label: id.toLowerCase(),
      type,
    })
    if (type === 'unwrapped') {
      const client = createWalletClient({
        account,
        chain: walletClient.chain,
        transport: http(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'),
      })
      const hash = await client.writeContract({
        address: V1_ENS_REGISTRY,
        abi: registryAbi,
        functionName: 'setOwner',
        args: [namehash(name), accounts.getAddress('user')],
      })
      await publicClient.waitForTransactionReceipt({ hash })
    }
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}/create-subname`)
    await page.locator('#label').fill('test')
    await page
      .getByRole('button', { name: 'Create subname', exact: true })
      .click()
    await driveTransactionsToSuccess(page, wallet, ['tx-create-ens-subname'])
    const child = `test.${name}`
    // Explorer separates creation from profile editing; preserve the old
    // record values and assertions across the two user-facing flows.
    await page.goto(`/${child}/edit-records`)
    for (const [key, value] of [
      ['name', 'Test Name'],
      ['description', 'New profile'],
    ]) {
      await page.getByLabel('Type', { exact: true }).selectOption('text')
      await page.getByLabel('Key', { exact: true }).fill(key)
      await page.getByLabel('Value', { exact: true }).fill(value)
      await page.getByRole('button', { name: 'Add record' }).click()
    }
    const address = '0x42D63ae25990889E35F215bC95884039Ba354115'
    await page.getByLabel('Type', { exact: true }).selectOption('address')
    await page.locator('button[role="combobox"]').click()
    await page.getByPlaceholder('Search coins...').fill('ETH')
    await page
      .getByRole('button', { name: /^ETH\b/i })
      .first()
      .click()
    await page.getByLabel('Value', { exact: true }).fill(address)
    await page.getByRole('button', { name: 'Add record' }).click()
    await page.getByRole('button', { name: 'Save 3 changes' }).click()
    await driveTransactionsToSuccess(page, wallet, ['tx-save-resolver-records'])
    const resolver = await publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: parseAbi(['function resolver(bytes32 node) view returns (address)']),
      functionName: 'resolver',
      args: [namehash(child)],
    })
    for (const [key, value] of [
      ['name', 'Test Name'],
      ['description', 'New profile'],
    ]) {
      expect(
        await publicClient.readContract({
          address: resolver,
          abi: parseAbi([
            'function text(bytes32 node, string key) view returns (string)',
          ]),
          functionName: 'text',
          args: [namehash(child), key],
        }),
      ).toBe(value)
    }
    expect(
      (
        await publicClient.readContract({
          address: resolver,
          abi: parseAbi(['function addr(bytes32 node) view returns (address)']),
          functionName: 'addr',
          args: [namehash(child)],
        })
      ).toLowerCase(),
    ).toBe(address.toLowerCase())
    await waitForBignameBlock()
    await page.goto(`/${child}/records`)
    for (const value of ['Test Name', 'New profile', address]) {
      await expect(page.getByText(value, { exact: true })).toBeVisible()
    }
  })
}

test('L033 wrapped V1 refuses an already existing subname', async ({
  portalPage: page,
  wallet,
  accounts,
}) => {
  const account = privateKeyToAccount(accounts.getPrivateKey('user'))
  const parent = await createMakeV1Name({ userAccount: account })({
    label: 'l033',
    type: 'wrapped',
  })
  await makeV1Subname({
    parentName: parent.replace(/\.eth$/, ''),
    childLabel: 'test',
    ownerAddress: account.address,
    parentOwnerAccount: account,
    fuses: 0,
  })
  await waitForBignameBlock()
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`/${parent}/create-subname`)
  await page.locator('#label').fill('test')
  await expect(
    page.getByRole('button', { name: 'Create subname', exact: true }),
  ).toBeDisabled()
  await expect(page.getByText(/already (exists|registered)/i)).toBeVisible()
})
