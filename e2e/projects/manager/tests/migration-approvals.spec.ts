/**
 * Approvals and confirmation accounting in the migration plan (§G.GA, §G.GU).
 *
 * The migration moves the owner's V1 tokens to the MigrationHelper, so the
 * owner must first let it move them (`planMigrationApprovals`):
 *
 *   unwrapped (BaseRegistrar, ERC-721)  one `approve(MigrationHelper, tokenId)`
 *                                       per name — ERC-721 allows a per-token
 *                                       approval, so nothing broader is asked
 *   wrapped / locked (NameWrapper,      one `setApprovalForAll(MigrationHelper)`
 *   ERC-1155)                           however many names — ERC-1155 has no
 *                                       per-token approval
 *   an operator approval already held   nothing for that contract
 *
 * Each step the confirm screen lists is one wallet confirmation, and in this
 * flow every confirmation is an `eth_sendTransaction` from the owner's EOA, so
 * the promised count, the prompts the wallet sees and the EOA's nonce delta
 * must all agree (GU2, GU3).
 *
 * Approvals are read on chain, so these run the same in mock and real mode.
 * Every test starts from a known approval state for the shared wallet.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { Web3RequestKind } from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import {
  type Address,
  encodeFunctionData,
  erc721Abi,
  labelhash,
  namehash,
  parseAbi,
  parseAbiItem,
  stringToHex,
  zeroAddress,
} from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name, FUSES } from '../../../fixtures/makeV1Name.js'
import {
  createAccounts,
  expect,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'
import {
  assertLockedMigration,
  assertUnlockedMigration,
  assertUnlockedTokenRoute,
  assertV2Reserved,
  readV2Status,
} from '../../../helpers/migration-assertions.js'
import {
  confirmAndAuthorize,
  openMigrationFlow,
  readPlan,
  rootRow,
  selectOnlyRoots,
  upgradeAndSettle,
  upgradeCountingPrompts,
} from '../../../helpers/migration-flow.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const sepolia = ensL1Contracts[supportedL1Chains.sepolia]
const BASE_REGISTRAR = sepolia.ensBaseRegistrarImplementation.address as Address
const NAME_WRAPPER = sepolia.ensNameWrapper.address as Address
const MIGRATION_HELPER = sepolia.ensMigrationHelper.address as Address

const APPROVED_ABI = parseAbi([
  'function getApproved(uint256 tokenId) view returns (address)',
])
const ERC721_ABI = parseAbi([
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
])
const OPERATOR_ABI = parseAbi([
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
])
const APPROVAL = parseAbiItem(
  'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
)
const APPROVAL_FOR_ALL = parseAbiItem(
  'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)',
)

const labelOf = (name: string) => name.replace(/\.eth$/, '')
const WRAPPED_APPROVAL = 'Approve your wrapped names'

/** Set the owner's operator approval for the MigrationHelper on both V1 contracts. */
async function setOperatorApprovals(
  owner: PrivateKeyAccount,
  isApproved: boolean,
) {
  for (const address of [BASE_REGISTRAR, NAME_WRAPPER]) {
    const current = await publicClient.readContract({
      address,
      abi: OPERATOR_ABI,
      functionName: 'isApprovedForAll',
      args: [owner.address, MIGRATION_HELPER],
    })
    if (current === isApproved) continue
    const hash = await walletClient.sendTransaction({
      account: owner,
      to: address,
      data: encodeFunctionData({
        abi: OPERATOR_ABI,
        functionName: 'setApprovalForAll',
        args: [MIGRATION_HELPER, isApproved],
      }),
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    expect(receipt.status).toBe('success')
  }
}

/** The approval steps the confirm screen lists, in order. */
const approvalSteps = (steps: readonly string[]) =>
  steps.filter((s) => /^Approve /.test(s) && !/restoring/i.test(s))

/** The block after the current head, uncached — the head holds our setup. */
const nextBlock = async () =>
  (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n

async function open(page: Page, names: readonly string[]) {
  await openMigrationFlow(page)
  for (const name of names)
    await expect(rootRow(page, name)).toBeVisible({ timeout: 60_000 })
  await selectOnlyRoots(page, names)
}

const ownerOf = (accounts: {
  readonly getPrivateKey: (u: 'user') => `0x${string}`
}) => privateKeyToAccount(accounts.getPrivateKey('user'))

test.describe('ENS V1 → V2 migration — approvals and confirmation accounting', () => {
  test.describe.configure({ timeout: 300_000 })

  test('one unwrapped name without an approval asks for exactly one per-token approve', {
    tag: ['@scenario:GA1'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = ownerOf(accounts)
    const name = await createMakeV1Name({ userAccount: owner })({
      label: 'ga1-one',
    })
    await setOperatorApprovals(owner, false)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [{ kind: 'registration', label: labelOf(name) }],
    })
    await open(page, [name])
    const plan = await readPlan(page)
    expect(approvalSteps(plan.steps)).toEqual([`Approve ${name}`])

    const fromBlock = await nextBlock()
    const prompts = await upgradeCountingPrompts(page, wallet)
    expect(prompts).toBe(plan.count)
    await assertUnlockedMigration(labelOf(name))

    // On chain: exactly that one ERC-721 approval, to the MigrationHelper.
    const approvals = await publicClient.getLogs({
      address: BASE_REGISTRAR,
      event: APPROVAL,
      args: { owner: owner.address },
      fromBlock,
    })
    expect(approvals.map((l) => [l.args.approved, l.args.tokenId])).toEqual([
      [MIGRATION_HELPER, BigInt(labelhash(labelOf(name)))],
    ])
    const operatorApprovals = await publicClient.getLogs({
      address: BASE_REGISTRAR,
      event: APPROVAL_FOR_ALL,
      args: { owner: owner.address },
      fromBlock,
    })
    expect(operatorApprovals, 'no operator-wide approval').toHaveLength(0)
  })

  test('two unwrapped names: one per-token approve each, never an operator-wide one', {
    tag: ['@scenario:GA2'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = ownerOf(accounts)
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const a = await makeV1Name({ label: 'ga2-u-a' })
    const b = await makeV1Name({ label: 'ga2-u-b' })
    await setOperatorApprovals(owner, false)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [a, b].map((n) => ({
        kind: 'registration' as const,
        label: labelOf(n),
      })),
    })
    await open(page, [a, b])
    const plan = await readPlan(page)
    expect([...approvalSteps(plan.steps)].sort()).toEqual(
      [`Approve ${a}`, `Approve ${b}`].sort(),
    )

    const fromBlock = await nextBlock()
    expect(await upgradeCountingPrompts(page, wallet)).toBe(plan.count)
    for (const n of [a, b]) await assertUnlockedMigration(labelOf(n))
    const operatorApprovals = await publicClient.getLogs({
      address: BASE_REGISTRAR,
      event: APPROVAL_FOR_ALL,
      args: { owner: owner.address },
      fromBlock,
    })
    expect(
      operatorApprovals,
      'no BaseRegistrar setApprovalForAll',
    ).toHaveLength(0)
  })

  test('a mixed batch: one NameWrapper approval covers every wrapped name, and prompts and nonce match the promise', {
    tag: ['@scenario:GA2', '@scenario:GU2', '@scenario:GU3'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = ownerOf(accounts)
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const unwrapped = await makeV1Name({ label: 'gu2-unwrapped' })
    const wrapped = await makeV1Name({ label: 'gu2-wrapped', type: 'wrapped' })
    const locked = await makeV1Name({ label: 'gu2-locked', type: 'locked' })
    await setOperatorApprovals(owner, false)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [
        { kind: 'registration', label: labelOf(unwrapped) },
        { kind: 'registration', label: labelOf(wrapped), type: 'wrapped' },
        { kind: 'registration', label: labelOf(locked), type: 'locked' },
      ],
    })
    await open(page, [unwrapped, wrapped, locked])

    // GU2: the count is computed before anything is clicked.
    const plan = await readPlan(page)
    // GA2 (ERC-1155): two wrapped names, one approval.
    expect([...approvalSteps(plan.steps)].sort()).toEqual(
      [`Approve ${unwrapped}`, WRAPPED_APPROVAL].sort(),
    )

    const fromBlock = await nextBlock()
    const nonceBefore = await publicClient.getTransactionCount({
      address: owner.address,
      blockTag: 'latest',
    })
    const prompts = await upgradeCountingPrompts(page, wallet)
    const nonceAfter = await publicClient.getTransactionCount({
      address: owner.address,
      blockTag: 'latest',
    })

    expect(prompts, 'GU2: prompts seen = confirmations promised').toBe(
      plan.count,
    )
    expect(
      nonceAfter - nonceBefore,
      'GU3: transactions the EOA sent = confirmations promised',
    ).toBe(plan.count)

    await assertUnlockedMigration(labelOf(unwrapped))
    await assertUnlockedMigration(labelOf(wrapped))
    await assertLockedMigration(labelOf(locked))
    const wrapperApprovals = await publicClient.getLogs({
      address: NAME_WRAPPER,
      event: APPROVAL_FOR_ALL,
      args: { owner: owner.address, operator: MIGRATION_HELPER },
      fromBlock,
    })
    expect(
      wrapperApprovals.map((l) => l.args.approved),
      'GA2: exactly one NameWrapper setApprovalForAll for both wrapped names',
    ).toEqual([true])
  })

  test('operator approvals already held: no approval steps, and none sent', {
    tag: ['@scenario:GA3'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = ownerOf(accounts)
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const unwrapped = await makeV1Name({ label: 'ga3-unwrapped' })
    const wrapped = await makeV1Name({ label: 'ga3-wrapped', type: 'wrapped' })
    await setOperatorApprovals(owner, true)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [
        { kind: 'registration', label: labelOf(unwrapped) },
        { kind: 'registration', label: labelOf(wrapped), type: 'wrapped' },
      ],
    })
    await open(page, [unwrapped, wrapped])
    const plan = await readPlan(page)
    expect(approvalSteps(plan.steps), 'zero approval rows').toEqual([])

    const fromBlock = await nextBlock()
    expect(await upgradeCountingPrompts(page, wallet)).toBe(plan.count)
    await assertUnlockedMigration(labelOf(unwrapped))
    await assertUnlockedMigration(labelOf(wrapped))
    for (const [address, event] of [
      [BASE_REGISTRAR, APPROVAL],
      [BASE_REGISTRAR, APPROVAL_FOR_ALL],
      [NAME_WRAPPER, APPROVAL_FOR_ALL],
    ] as const) {
      const logs = await publicClient.getLogs({
        address,
        event,
        args: { owner: owner.address },
        fromBlock,
      } as never)
      expect(logs, `no ${event.name} sent on ${address}`).toHaveLength(0)
    }
  })

  test('the upgrade list holds exactly the migratable names, and names the one that cannot be', {
    tag: ['@scenario:GU1'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    test.fail(
      true,
      'E2E-020: a name that can never migrate is silently left off the upgrade list, with no reason shown',
    )
    const owner = ownerOf(accounts)
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const unwrapped = await makeV1Name({ label: 'gu1-unwrapped' })
    const wrapped = await makeV1Name({ label: 'gu1-wrapped', type: 'wrapped' })
    const locked = await makeV1Name({ label: 'gu1-locked', type: 'locked' })
    const frozen = await makeV1Name({
      label: 'gu1-frozen',
      type: 'locked',
      fuses: FUSES.CANNOT_TRANSFER,
    })

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [
        { kind: 'registration', label: labelOf(unwrapped) },
        { kind: 'registration', label: labelOf(wrapped), type: 'wrapped' },
        { kind: 'registration', label: labelOf(locked), type: 'locked' },
        {
          kind: 'registration',
          label: labelOf(frozen),
          type: 'locked',
          ownerFuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_TRANSFER,
        },
      ],
    })
    await openMigrationFlow(page)

    // Every migratable input is offered, selected by default.
    for (const n of [unwrapped, wrapped, locked]) {
      await expect(rootRow(page, n)).toBeVisible({ timeout: 60_000 })
      await expect(rootRow(page, n)).toBeChecked()
    }
    // The one that cannot migrate is not selectable…
    await expect(rootRow(page, frozen)).toHaveCount(0)
    // …and (INV3 totality) must still land in a visible bucket, with a reason.
    await expect(
      page.getByText(frozen, { exact: true }),
      `${frozen} is in neither list`,
    ).toBeVisible()
  })
})

test.describe('ENS V1 → V2 migration — the name changes under the flow (GA10)', () => {
  test.describe.configure({ timeout: 300_000 })

  test('the token leaves the wallet after selection: the upgrade stops and says the owner changed', {
    tag: ['@scenario:GA10'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    test.fail(
      true,
      'E2E-028: a token that changed owner is reported as "A permission is missing. Try again."',
    )
    const owner = ownerOf(accounts)
    const other = accounts.getAddress('user2') as Address
    const name = await createMakeV1Name({ userAccount: owner })({
      label: 'ga10-moved',
    })
    // Operator approval held, so the plan has no per-token approve: an
    // approve for a token the wallet no longer holds reverts at estimate, and
    // the headless wallet never answers a send that fails there.
    await setOperatorApprovals(owner, true)
    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [{ kind: 'registration', label: labelOf(name) }],
    })
    await open(page, [name])
    await readPlan(page)

    // Behind the page's back: the registrant sends the token away.
    const tokenId = BigInt(labelhash(labelOf(name)))
    const hash = await walletClient.sendTransaction({
      account: owner,
      to: BASE_REGISTRAR,
      data: encodeFunctionData({
        abi: ERC721_ABI,
        functionName: 'transferFrom',
        args: [owner.address, other, tokenId],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash })

    expect(await upgradeAndSettle(page, wallet)).toBe('ownerChanged')
    expect(
      await publicClient.readContract({
        address: BASE_REGISTRAR,
        abi: ERC721_ABI,
        functionName: 'ownerOf',
        args: [tokenId],
      }),
      'nothing moved the token back or onward',
    ).toBe(other)
    expect(await readV2Status(labelOf(name)), 'still RESERVED in V2').toBe(1)
  })

  for (const shape of ['unwrapped', 'wrapped'] as const)
    test(`a ${shape} name whose operator approval is revoked after the plan: never a generic failure`, {
      tag: ['@scenario:GA10'],
    }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
      const owner = ownerOf(accounts)
      const name = await createMakeV1Name({ userAccount: owner })({
        label: `ga10-revoked-${shape}`,
        type: shape,
      })
      // Approved up front, so the plan asks for no approval step…
      await setOperatorApprovals(owner, true)
      await serveV1Names(page, {
        ownerAddress: owner.address,
        roots: [{ kind: 'registration', label: labelOf(name), type: shape }],
      })
      await open(page, [name])
      const plan = await readPlan(page)
      expect(
        approvalSteps(plan.steps),
        'precondition: no approval planned',
      ).toEqual([])

      // …then revoked behind the page's back.
      await setOperatorApprovals(owner, false)

      const outcome = await upgradeAndSettle(page, wallet)
      // Honest endings: the app asks again and the name lands, or it stops
      // and names the permission (measured: "Your permissions changed. Go
      // back to check the updated estimate."). Silence or the generic message
      // is not.
      expect(['success', 'permissionMissing', 'planChanged']).toContain(outcome)
      if (outcome === 'success') await assertUnlockedMigration(labelOf(name))
      else
        expect(await readV2Status(labelOf(name)), 'still RESERVED in V2').toBe(
          1,
        )
    })
})

test.describe('ENS V1 → V2 migration — interrupted between prompts (GU7)', () => {
  test.describe.configure({ timeout: 300_000 })

  test('a reload after the approval but before the upgrade: nothing half-done, and the rest resumes', {
    tag: ['@scenario:GU7'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = ownerOf(accounts)
    const name = await createMakeV1Name({ userAccount: owner })({
      label: 'gu7-interrupted',
    })
    await setOperatorApprovals(owner, false)
    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [{ kind: 'registration', label: labelOf(name) }],
    })
    await open(page, [name])
    const before = await readPlan(page)
    expect(
      approvalSteps(before.steps),
      'precondition: an approval is planned',
    ).toEqual([`Approve ${name}`])
    expect(before.count).toBe(2)

    // Authorize the first prompt (the approval) only.
    const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
    await upgrade.click()
    await expect
      .poll(
        () => wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
        {
          timeout: 60_000,
        },
      )
      .toBeGreaterThanOrEqual(1)
    await wallet.authorize(Web3RequestKind.SendTransaction)
    const tokenId = BigInt(labelhash(labelOf(name)))
    await expect
      .poll(
        () =>
          publicClient.readContract({
            address: BASE_REGISTRAR,
            abi: APPROVED_ABI,
            functionName: 'getApproved',
            args: [tokenId],
          }),
        { timeout: 60_000, message: 'the approval landed' },
      )
      .toBe(MIGRATION_HELPER)

    // The upgrade prompt is next; close the page on it instead.
    await expect
      .poll(
        () => wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
        {
          timeout: 60_000,
        },
      )
      .toBeGreaterThanOrEqual(1)
    await wallet.reject(Web3RequestKind.SendTransaction).catch(() => undefined)
    await page.reload()

    // Nothing half-done: the name is untouched on both sides.
    expect(await readV2Status(labelOf(name)), 'still RESERVED in V2').toBe(1)
    expect(
      await publicClient.readContract({
        address: BASE_REGISTRAR,
        abi: ERC721_ABI,
        functionName: 'ownerOf',
        args: [tokenId],
      }),
      'the token never left the owner',
    ).toBe(owner.address)

    // Resumes: the plan now skips the approval that already executed, and
    // the upgrade completes.
    await open(page, [name])
    const after = await readPlan(page)
    expect(
      approvalSteps(after.steps),
      'the executed approval is not asked again',
    ).toEqual([])
    expect(after.count).toBe(1)
    const prompts = await upgradeCountingPrompts(page, wallet)
    expect(prompts).toBe(after.count)
    await assertUnlockedMigration(labelOf(name))
  })
})

const isolatedTest = test.extend({
  accounts: async ({ accounts: _baseAccounts }, use) => {
    const isolated = createAccounts(30_000_000 + (Date.now() % 10_000_000))
    await testClient.setBalance({
      address: isolated.getAddress('user'),
      value: 100n * 10n ** 18n,
    })
    await use(isolated)
  },
})

isolatedTest(
  'a permission removed after preview requires a new estimate and offers no ineffective retry (WEB-1946)',
  { tag: ['@smoke'] },
  async ({ migrationConnectedPage: page, wallet, accounts }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const name = await makeV1Name({ label: 'web1946-plan-change' })
    const label = name.replace(/\.eth$/, '')
    const approve = async (operator: Address) => {
      const hash = await walletClient.writeContract({
        account: owner,
        address: BASE_REGISTRAR,
        abi: erc721Abi,
        functionName: 'approve',
        args: [operator, BigInt(labelhash(label))],
      })
      expect(
        (await publicClient.waitForTransactionReceipt({ hash })).status,
      ).toBe('success')
    }
    await approve(MIGRATION_HELPER)
    expect(
      await publicClient.readContract({
        address: BASE_REGISTRAR,
        abi: erc721Abi,
        functionName: 'isApprovedForAll',
        args: [owner.address, MIGRATION_HELPER],
      }),
    ).toBe(false)
    await serveV1Names(page, [
      { name, ownerAddress: owner.address, type: 'unwrapped' },
    ])
    await openMigrationFlow(page)
    await expect(rootRow(page, name)).toBeVisible({ timeout: 60_000 })
    await selectOnlyRoots(page, [name])
    await readPlan(page)

    await approve(zeroAddress)
    await page
      .getByRole('button', { name: 'Upgrade 1 name', exact: true })
      .click()
    await expect(
      page.getByText("Upgrade didn't finish", { exact: true }),
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByText(/go back to check the updated estimate/i),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Try again', exact: true }),
    ).toHaveCount(0)
    expect(wallet.getPendingRequestCount(Web3RequestKind.SendTransaction)).toBe(
      0,
    )
    expect(
      await publicClient.readContract({
        address: BASE_REGISTRAR,
        abi: erc721Abi,
        functionName: 'ownerOf',
        args: [BigInt(labelhash(label))],
      }),
    ).toBe(owner.address)
    await assertV2Reserved(label)
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('plan-changed-mobile.png'),
    })

    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(rootRow(page, name)).toBeVisible({ timeout: 60_000 })
    await readPlan(page)
    await confirmAndAuthorize(page, wallet)
    await assertUnlockedTokenRoute(label, namehash(name), { wrapped: false })
  },
)

isolatedTest(
  'a live gas split adds a progress step before the extra wallet prompt (WEB-1946)',
  { tag: ['@smoke'] },
  async ({ migrationConnectedPage: page, wallet, accounts }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const names = [
      await makeV1Name({ label: 'web1946-split-a' }),
      await makeV1Name({ label: 'web1946-split-b' }),
    ]
    await serveV1Names(
      page,
      names.map((name) => ({
        name,
        ownerAddress: owner.address,
        type: 'unwrapped',
      })),
    )
    await openMigrationFlow(page)
    for (const name of names)
      await expect(rootRow(page, name)).toBeVisible({ timeout: 60_000 })
    await selectOnlyRoots(page, names)
    const preview = await readPlan(page)
    expect(preview.steps.filter((step) => /^Upgrade /.test(step))).toHaveLength(
      1,
    )

    const encodedLabels = names.map((name) =>
      stringToHex(name.replace(/\.eth$/, '')).slice(2),
    )
    let splitEstimates = 0
    await page.route(
      /^(?:http:\/\/(?:localhost|127\.0\.0\.1):\d+|https:\/\/(?:ethereum-sepolia-rpc\.publicnode\.com|sepolia\.gateway\.tenderly\.co|lb\.drpc\.live\/sepolia))(\/|$)/,
      async (route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        const body: unknown = route.request().postDataJSON()
        const messages: readonly unknown[] = Array.isArray(body) ? body : [body]
        const hasCombinedEstimate = messages.some(
          (message) =>
            typeof message === 'object' &&
            message !== null &&
            'method' in message &&
            message.method === 'eth_estimateGas' &&
            encodedLabels.every((label) =>
              JSON.stringify(message).includes(label),
            ),
        )
        if (!hasCombinedEstimate) return route.fallback()
        const response = await route.fetch({
          url: process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545',
        })
        const responses: unknown = await response.json()
        const withLiveGas = (entry: unknown): unknown => {
          if (typeof entry !== 'object' || entry === null || !('id' in entry))
            return entry
          const request = messages.find(
            (message) =>
              typeof message === 'object' &&
              message !== null &&
              'id' in message &&
              message.id === entry.id,
          )
          if (
            typeof request !== 'object' ||
            request === null ||
            !('method' in request) ||
            request.method !== 'eth_estimateGas' ||
            !encodedLabels.every((label) =>
              JSON.stringify(request).includes(label),
            )
          )
            return entry
          splitEstimates += 1
          return { jsonrpc: '2.0', id: entry.id, result: '0xf42400' }
        }
        await route.fulfill({
          response,
          json: Array.isArray(responses)
            ? responses.map(withLiveGas)
            : withLiveGas(responses),
        })
      },
    )

    await page
      .getByRole('button', { name: 'Upgrade 2 names', exact: true })
      .click()
    const success = page.getByRole('heading', {
      name: /your names? (has|have) been upgraded/i,
    })
    let prompts = 0
    let progress: readonly {
      readonly completed: number
      readonly total: number
    }[] = []
    while (!(await success.isVisible()) && prompts <= preview.count + 2) {
      await expect
        .poll(
          async () =>
            (await success.isVisible()) ||
            wallet.getPendingRequestCount(Web3RequestKind.SendTransaction) > 0,
          { timeout: 120_000 },
        )
        .toBe(true)
      if (await success.isVisible()) break
      const bar = page.getByRole('progressbar', { name: 'Upgrade progress' })
      const completed = Number(await bar.getAttribute('aria-valuenow'))
      const total = Number(await bar.getAttribute('aria-valuemax'))
      expect(
        completed,
        'an open wallet prompt must not show completed progress',
      ).toBeLessThan(total)
      progress = [...progress, { completed, total }]
      prompts += 1
      await wallet.authorize(Web3RequestKind.SendTransaction)
    }
    await expect(success).toBeVisible()
    expect(splitEstimates).toBeGreaterThan(0)
    expect(prompts).toBe(preview.count + 1)
    expect(progress.at(-1)?.total).toBe(preview.count + 1)
    for (const name of names)
      await assertUnlockedTokenRoute(
        name.replace(/\.eth$/, ''),
        namehash(name),
        {
          wrapped: false,
        },
      )
    await testInfo.attach('live-progress.json', {
      body: JSON.stringify({ preview, prompts, progress, splitEstimates }),
      contentType: 'application/json',
    })
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('split-success-desktop.png'),
    })
  },
)
