import { labelhash, namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { makeV1FourLD } from '../../../fixtures/makeV1FourLD.js'
import {
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
} from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import {
  isRealBigname,
  waitForBignameName,
  waitForBignameNames,
} from '../../../helpers/bigname-sync.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import {
  driveTransactionsToSuccess,
  transferTxId,
} from '../../../helpers/transaction-modal.js'
import { readChainTruth } from '../../../matrix/chain.js'

const origin = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const records = { texts: [{ key: 'com.twitter', value: 'fourld-transfer' }] }

test.beforeEach(() =>
  test.skip(!isRealBigname, 'V1 4LD trees require real bigname'),
)

// Literal tags keep the coverage reconciler honest for both write paths.
test('owner transfers a wrapped 4LD and preserves its records', {
  tag: ['@scenario:Q9'],
}, async ({ portalPage: page, wallet, accounts }) => {
  const tree = await makeV1FourLD(
    { twoLd: 'wrapped', threeLd: 'unlocked', fourLd: 'unlocked', records },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  await expectRecordsResolve(tree.name, records)
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`${origin}/${tree.name}/ownership/transfer`)
  await page
    .getByPlaceholder('ENS name or address')
    .fill(accounts.getAddress('user2'))
  // This scenario explicitly keeps the resolver; detaching intentionally clears resolution.
  await page.locator('#transfer-option-detachResolver').uncheck()
  await page.getByRole('button', { name: 'Transfer name', exact: true }).click()
  await driveTransactionsToSuccess(page, wallet, [
    transferTxId(tree.name, 'transfer-erc1155'),
  ])
  await expect
    .poll(async () =>
      (await readChainTruth(tree.name)).wrapperOwner?.toLowerCase(),
    )
    .toBe(accounts.getAddress('user2').toLowerCase())
  await expectRecordsResolve(tree.name, records)
  expect((await readChainTruth(tree.threeLd.name)).wrapperOwner).toBe(
    tree.threeLd.wrapperOwner,
  )
})

test('owner transfers a registry-only 4LD without moving its ancestors', {
  tag: ['@scenario:Q10'],
}, async ({ portalPage: page, wallet, accounts }) => {
  const tree = await makeV1FourLD(
    { twoLd: 'unwrapped', threeLd: 'registry', fourLd: 'registry', records },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  await expectRecordsResolve(tree.name, records)
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`${origin}/${tree.name}/ownership/transfer`)
  await page
    .getByPlaceholder('ENS name or address')
    .fill(accounts.getAddress('user2'))
  // This scenario explicitly keeps the resolver; detaching intentionally clears resolution.
  await page.locator('#transfer-option-detachResolver').uncheck()
  await page.getByRole('button', { name: 'Transfer name', exact: true }).click()
  await driveTransactionsToSuccess(page, wallet, [
    transferTxId(tree.name, 'set-registry-owner'),
  ])
  await expect
    .poll(async () =>
      (await readChainTruth(tree.name)).controller.toLowerCase(),
    )
    .toBe(accounts.getAddress('user2').toLowerCase())
  expect((await readChainTruth(tree.threeLd.name)).controller).toBe(
    tree.threeLd.controller,
  )
  await expectRecordsResolve(tree.name, records)
})

test('3LD owner reclaims an unlocked wrapped 4LD', {
  tag: ['@scenario:Q11'],
}, async ({ portalPage: page, wallet, accounts }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'wrapped',
      threeLd: 'unlocked',
      fourLd: 'unlocked',
      owners: { fourLd: 'user3' },
      records,
    },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`${origin}/${tree.name}/ownership/transfer`)
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'reassigning this subname as the owner of' }),
  ).toContainText(tree.threeLd.name)
  await page
    .getByPlaceholder('ENS name or address')
    .fill(accounts.getAddress('user'))
  await page.getByRole('button', { name: 'Transfer name', exact: true }).click()
  await driveTransactionsToSuccess(page, wallet, [
    transferTxId(tree.name, 'set-subnode-owner'),
  ])
  const after = await readChainTruth(tree.name)
  expect(after.wrapperOwner?.toLowerCase()).toBe(
    accounts.getAddress('user').toLowerCase(),
  )
  expect(after.fuses).toBe(tree.fourLd.fuses)
  expect(after.expiry).toBe(tree.fourLd.expiry)
  // The old holder can no longer transfer, independently of the UI's gate.
  await expect(
    publicClient.simulateContract({
      address: V1_NAME_WRAPPER,
      abi: parseAbi([
        'function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes data)',
      ]),
      functionName: 'safeTransferFrom',
      account: accounts.getAddress('user3'),
      args: [
        accounts.getAddress('user3'),
        accounts.getAddress('user2'),
        BigInt(tree.node),
        1n,
        '0x',
      ],
    }),
  ).rejects.toThrow()
})

test('3LD owner cannot reclaim an emancipated 4LD', {
  tag: ['@scenario:Q12'],
}, async ({ portalPage: page, wallet, accounts }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'locked',
      threeLd: 'locked',
      fourLd: 'emancipated',
      owners: { fourLd: 'user2' },
    },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`${origin}/${tree.name}/ownership/transfer`)
  await expect(
    page.getByText('This subname is out of the parent’s control'),
  ).toBeVisible()
  await expect(page.getByPlaceholder('ENS name or address')).toHaveCount(0)
  await expect(
    publicClient.simulateContract({
      address: V1_NAME_WRAPPER,
      abi: parseAbi([
        'function setSubnodeOwner(bytes32 parentNode,string label,address owner,uint32 fuses,uint64 expiry) returns (bytes32)',
      ]),
      functionName: 'setSubnodeOwner',
      account: accounts.getAddress('user'),
      args: [
        namehash(tree.threeLd.name),
        tree.name.slice(0, tree.name.indexOf('.')),
        accounts.getAddress('user'),
        0,
        tree.fourLd.expiry,
      ],
    }),
  ).rejects.toThrow()
  expect((await readChainTruth(tree.name)).wrapperOwner).toBe(
    tree.fourLd.wrapperOwner,
  )
})

test('owner burns CANNOT_TRANSFER on a locked 4LD and loses the transfer form', {
  tag: ['@scenario:Q15'],
}, async ({ portalPage: page, wallet, accounts }) => {
  const tree = await makeV1FourLD(
    { twoLd: 'locked', threeLd: 'locked', fourLd: 'locked' },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`${origin}/${tree.name}/fuses/burn`)
  await page
    .getByText('Cannot Transfer', { exact: true })
    .locator('..')
    .getByRole('checkbox')
    .check()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await driveTransactionsToSuccess(page, wallet, ['tx-burn-fuses'])
  await expect
    .poll(async () => (await readChainTruth(tree.name)).fuses & 4)
    .toBe(4)
  await page.goto(`${origin}/${tree.name}/ownership/transfer`)
  await expect(
    page
      .getByText(/cannot.*transfer|transfer.*disabled|transfer.*burnt/i)
      .first(),
  ).toBeVisible()
  await expect(page.getByPlaceholder('ENS name or address')).toHaveCount(0)
  expect((await readChainTruth(tree.name)).wrapperOwner).toBe(
    tree.fourLd.wrapperOwner,
  )
})

test('grandparent can reclaim through the 3LD although explorer exposes only immediate authority', {
  tag: ['@scenario:Q13'],
}, async ({ portalPage: page, wallet, accounts }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'unwrapped',
      threeLd: 'registry',
      fourLd: 'registry',
      owners: { threeLd: 'user2', fourLd: 'user3' },
    },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`${origin}/${tree.name}/ownership/transfer`)
  await expect(
    page.getByText(/not.*owner|cannot transfer|can.t transfer/i).first(),
  ).toBeVisible()
  await expect(page.getByPlaceholder('ENS name or address')).toHaveCount(0)
  await expect(
    page.getByText(
      `Only the current owner, or the owner of ${tree.threeLd.name}, can move it.`,
      { exact: true },
    ),
  ).toBeVisible()
  const account = privateKeyToAccount(accounts.getPrivateKey('user'))
  const abi = parseAbi([
    'function setSubnodeOwner(bytes32 node,bytes32 label,address owner) returns (bytes32)',
  ])
  for (const [parent, child] of [
    [tree.twoLd, tree.threeLd],
    [tree.threeLd, tree.fourLd],
  ] as const) {
    const hash = await walletClient.writeContract({
      account,
      address: V1_ENS_REGISTRY,
      abi,
      functionName: 'setSubnodeOwner',
      args: [
        parent.node,
        labelhash(child.name.slice(0, child.name.indexOf('.'))),
        account.address,
      ],
    })
    expect(
      (await publicClient.waitForTransactionReceipt({ hash })).status,
    ).toBe('success')
    expect((await readChainTruth(child.name)).controller.toLowerCase()).toBe(
      account.address.toLowerCase(),
    )
  }
  // The page reads the holder from the index too: wait for it to catch up.
  await waitForBignameName(
    tree.name,
    (name) => name.owner?.toLowerCase() === account.address.toLowerCase(),
  )
  await page.reload()
  await expect(page.getByPlaceholder('ENS name or address')).toBeVisible()
})
