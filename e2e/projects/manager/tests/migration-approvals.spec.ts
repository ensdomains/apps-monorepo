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
import type { Page } from '@playwright/test'
import { type Address, encodeFunctionData, parseAbi, parseAbiItem } from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import {
  assertUnlockedMigration,
  readV2Status,
} from '../../../helpers/migration-assertions.js'
import {
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
})

test.describe('ENS V1 → V2 migration — the name changes under the flow (GA10)', () => {
  test.describe.configure({ timeout: 300_000 })

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
