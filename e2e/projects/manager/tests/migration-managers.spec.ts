/**
 * Carrying a V1 manager into V2 (§G.GM).
 *
 * An unwrapped V1 .eth name has two holders: the registrant (the BaseRegistrar
 * ERC-721) and the registry controller (the "manager"). Migration moves the
 * token to the registrant. When the controller is someone else, the selection
 * screen asks — per name, showing the address — whether to keep it as a
 * manager (#1215, WEB-1528). Opting in adds three calls around the migration:
 *
 *   1. a temporary `setApprovalForAll(hca, true)` on the V2 ETHRegistry, so the
 *      HCA can act for the owner;
 *   2. `grantRoles(name, ROLE_SET_RESOLVER, controller)` in the atomic batch
 *      (`buildRoleGrantCall`);
 *   3. `setApprovalForAll(hca, false)` once the batch has landed
 *      (`revokeTemporaryOperatorApprovals`).
 *
 * GM1 is the confirmation cost of that; GM3 is what the manager actually ends
 * up holding — the bitmap, read from the registry, not the flow's success.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  type Web3ProviderBackend,
  Web3RequestKind,
} from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import { type Address, isAddressEqual, parseAbi, parseAbiItem } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getDestinationContracts } from '../../../../packages/smart-account/src/providers/rhinestone/manifest.ts'
import {
  createMakeV1Name,
  V1_NAME_WRAPPER,
} from '../../../fixtures/makeV1Name.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { splitController } from '../../../fixtures/v1-tails.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { assertV2Registered } from '../../../helpers/migration-assertions.js'
import {
  openMigrationFlow,
  rootRow,
  selectOnlyRoots,
} from '../../../helpers/migration-flow.js'
import { serveV1Names } from '../../../helpers/v1-names.js'
import { assertRoleBitmap } from '../../../helpers/role-assertions.js'

const ETH_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
  .address as Address

const APPROVAL_FOR_ALL = parseAbiItem(
  'event ApprovalForAll(address indexed account, address indexed operator, bool approved)',
)

const labelOf = (name: string) => name.replace(/\.eth$/, '')

/** The restoration opt-in on a row: "Keep 0x… as a manager. …". */
const restorationCheckbox = (page: Page) =>
  page.getByRole('checkbox', { name: /^Keep .* as a manager/ })

/**
 * The plan the confirm screen promises: the "N requests" count and the step
 * titles in "What you'll approve", in order.
 */
async function readPlan(page: Page) {
  const trigger = page.getByRole('button', { name: /^\d+ requests?$/ })
  await expect(trigger).toBeVisible({ timeout: 60_000 })
  const count = Number.parseInt(await trigger.innerText(), 10)
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: "What you'll approve" })
  await expect(dialog).toBeVisible()
  const steps = await dialog.locator('ol > li h3').allInnerTexts()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  console.log(`[gm] plan: ${count} requests — ${steps.join(' → ')}`)
  return { count, steps }
}

/**
 * Click "Upgrade N names" and authorize every wallet prompt until the success
 * screen, returning how many `eth_sendTransaction` prompts the wallet saw.
 */
async function upgradeCountingPrompts(page: Page, wallet: Web3ProviderBackend) {
  const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
  await expect(upgrade).toBeEnabled({ timeout: 60_000 })
  let done = false
  let prompts = 0
  const authorizeAll = (async () => {
    while (!done) {
      if (wallet.getPendingRequestCount(Web3RequestKind.SendTransaction) > 0) {
        await wallet.authorize(Web3RequestKind.SendTransaction)
        prompts++
        continue
      }
      await page.waitForTimeout(250).catch(() => {})
    }
  })()
  await upgrade.click()
  await expect(
    page.getByRole('heading', {
      name: /your names? (has|have) been upgraded/i,
    }),
  ).toBeVisible({ timeout: 180_000 })
  done = true
  await authorizeAll
  return prompts
}

const HCA_FACTORY = ensL1Contracts[supportedL1Chains.sepolia].ensHcaFactory
  .address as Address
/** The implementation the app deploys, from its own manifest (as in hca-session-revoke.spec.ts). */
const HCA_IMPLEMENTATION = getDestinationContracts(
  supportedL1Chains.sepolia,
).standaloneHcaImplementation

/** The owner's HCA address: what `deploy` would return, simulated only. */
async function hcaOf(owner: Address): Promise<Address> {
  const { result } = await publicClient.simulateContract({
    account: owner,
    address: HCA_FACTORY,
    abi: parseAbi([
      'function deploy(address owner, address hcaImplementation, uint256 userSalt) returns (address hca)',
    ]),
    functionName: 'deploy',
    args: [owner, HCA_IMPLEMENTATION, 0n],
  })
  return result
}

const isApprovedForAll = (owner: Address, operator: Address) =>
  publicClient.readContract({
    address: ETH_REGISTRY,
    abi: parseAbi([
      'function isApprovedForAll(address owner, address operator) view returns (bool)',
    ]),
    functionName: 'isApprovedForAll',
    args: [owner, operator],
  })

test.describe('ENS V1 → V2 migration — carrying a V1 manager (§G.GM)', () => {
  test.describe.configure({ timeout: 300_000 })

  test('keeping a V1 manager costs exactly an approve and a revoke, and leaves it ROLE_SET_RESOLVER and nothing else', {
    tag: ['@scenario:GM1', '@scenario:GM3'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const manager = accounts.getAddress('user2')
    const makeV1Name = createMakeV1Name({ userAccount: owner })

    const name = await makeV1Name({ label: 'gm1-managed' })
    await splitController(name, owner, manager)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [
        {
          kind: 'registration',
          label: labelOf(name),
          ownerAddress: manager,
          registrantAddress: owner.address,
        },
      ],
    })

    await openMigrationFlow(page)
    await expect(rootRow(page, name)).toBeVisible({ timeout: 30_000 })
    await selectOnlyRoots(page, [name])

    // Offered, showing the controller, and off by default: nothing is granted
    // unless the owner asks.
    const optIn = restorationCheckbox(page)
    await expect(optIn).toBeVisible()
    await expect(optIn).not.toBeChecked()
    await expect(
      page.locator(`label[title="${manager}" i]`),
      'the opt-in must name the address it would hand authority to',
    ).toHaveCount(1)

    const without = await readPlan(page)
    await optIn.locator('xpath=..').click()
    await expect(optIn).toBeChecked()
    const withManager = await readPlan(page)

    // GM1: exactly two more confirmations — the temporary approval before the
    // batch and its revocation after — and nothing else changes.
    expect(
      withManager.count - without.count,
      `requests without: ${without.steps.join(' → ')}\n` +
        `requests with:    ${withManager.steps.join(' → ')}`,
    ).toBe(2)
    const added = withManager.steps.filter((s) => !without.steps.includes(s))
    expect(
      added,
      `steps added by the opt-in: ${added.join(' → ')}`,
    ).toHaveLength(2)
    expect(withManager.steps.indexOf(added[0])).toBeLessThan(
      withManager.steps.indexOf(added[1]),
    )

    // The block after the current head, uncached: the head itself holds this
    // test's own setup transactions.
    const fromBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n
    const prompts = await upgradeCountingPrompts(page, wallet)
    expect(
      prompts,
      'the wallet must be asked exactly as many times as the confirm screen said',
    ).toBe(withManager.count)

    // GM3: the manager holds exactly ROLE_SET_RESOLVER on the migrated name.
    const label = labelOf(name)
    await assertV2Registered(label)
    await assertRoleBitmap({ label }, manager, ['ROLE_SET_RESOLVER'])

    // …and the HCA's operator approval was temporary: granted and revoked
    // during this run, and not left behind.
    const approvals = await publicClient.getLogs({
      address: ETH_REGISTRY,
      event: APPROVAL_FOR_ALL,
      args: { account: owner.address },
      fromBlock,
    })
    expect(
      approvals.map((l) => l.args.approved),
      'expected one temporary approval, then its revocation',
    ).toEqual([true, false])
    const [granted, revoked] = approvals
    expect(
      isAddressEqual(
        granted.args.operator as Address,
        revoked.args.operator as Address,
      ),
    ).toBe(true)
  })

  test('without the opt-in, a V1 manager is granted nothing', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const manager = accounts.getAddress('user2')
    const makeV1Name = createMakeV1Name({ userAccount: owner })

    const name = await makeV1Name({ label: 'gm1-declined' })
    await splitController(name, owner, manager)
    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [
        {
          kind: 'registration',
          label: labelOf(name),
          ownerAddress: manager,
          registrantAddress: owner.address,
        },
      ],
    })

    await openMigrationFlow(page)
    await expect(rootRow(page, name)).toBeVisible({ timeout: 30_000 })
    await selectOnlyRoots(page, [name])
    await expect(restorationCheckbox(page)).not.toBeChecked()

    await upgradeCountingPrompts(page, wallet)

    const label = labelOf(name)
    await assertV2Registered(label)
    await assertRoleBitmap({ label }, manager, [])
  })
  test('with the HCA already approved, keeping a manager costs only the revoke, and that approval is cleaned up', {
    tag: ['@scenario:GM2'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const manager = accounts.getAddress('user2')
    const makeV1Name = createMakeV1Name({ userAccount: owner })

    const name = await makeV1Name({ label: 'gm2-preapproved' })
    await splitController(name, owner, manager)
    const hca = await hcaOf(owner.address)
    // Start clean, so the baseline below has no cleanup step in it.
    if (await isApprovedForAll(owner.address, hca)) {
      const hash = await walletClient.writeContract({
        account: owner,
        address: ETH_REGISTRY,
        abi: parseAbi([
          'function setApprovalForAll(address operator, bool approved)',
        ]),
        functionName: 'setApprovalForAll',
        args: [hca, false],
      })
      await publicClient.waitForTransactionReceipt({ hash })
    }

    const mock = {
      ownerAddress: owner.address,
      roots: [
        {
          kind: 'registration' as const,
          label: labelOf(name),
          ownerAddress: manager,
          registrantAddress: owner.address,
        },
      ],
    }
    await serveV1Names(page, mock)
    await openMigrationFlow(page)
    await expect(rootRow(page, name)).toBeVisible({ timeout: 30_000 })
    await selectOnlyRoots(page, [name])
    const baseline = await readPlan(page)

    // The state an interrupted earlier run leaves behind.
    const hash = await walletClient.writeContract({
      account: owner,
      address: ETH_REGISTRY,
      abi: parseAbi([
        'function setApprovalForAll(address operator, bool approved)',
      ]),
      functionName: 'setApprovalForAll',
      args: [hca, true],
    })
    await publicClient.waitForTransactionReceipt({ hash })
    expect(await isApprovedForAll(owner.address, hca)).toBe(true)

    await page.reload()
    await openMigrationFlow(page)
    await expect(rootRow(page, name)).toBeVisible({ timeout: 30_000 })
    await selectOnlyRoots(page, [name])
    const optIn = restorationCheckbox(page)
    await optIn.locator('xpath=..').click()
    await expect(optIn).toBeChecked()
    const withManager = await readPlan(page)

    expect(
      withManager.count - baseline.count,
      `baseline: ${baseline.steps.join(' → ')}\n` +
        `with:     ${withManager.steps.join(' → ')}`,
    ).toBe(1)

    // The block after the current head, uncached: the head itself holds this
    // test's own setup transactions.
    const fromBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n
    const prompts = await upgradeCountingPrompts(page, wallet)
    expect(prompts).toBe(withManager.count)

    const label = labelOf(name)
    await assertV2Registered(label)
    await assertRoleBitmap({ label }, manager, ['ROLE_SET_RESOLVER'])
    const approvals = await publicClient.getLogs({
      address: ETH_REGISTRY,
      event: APPROVAL_FOR_ALL,
      args: { account: owner.address },
      fromBlock,
    })
    expect(
      approvals.map((l) => l.args.approved),
      'no new approval, only the revocation of the existing one',
    ).toEqual([false])
    expect(await isApprovedForAll(owner.address, hca)).toBe(false)
  })
  test('a wrapped name is never offered a manager: its only V1 registry controller is the NameWrapper itself', {
    tag: ['@scenario:GM4'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const manager = accounts.getAddress('user2')
    const makeV1Name = createMakeV1Name({ userAccount: owner })

    // The subgraph reports a wrapped .eth name with `owner` = the NameWrapper
    // (it holds the legacy registry slot by construction) and the wrapped
    // owner as registrant, so registrant and controller always "differ".
    // `registryControllerOf` alone would offer the NameWrapper as a manager;
    // `classifyUnlockedWrapper` sets `registryController: null` instead. The
    // unwrapped control proves the opt-in renders at all on this screen.
    const wrapped = await makeV1Name({ label: 'gm4-wrapped', type: 'wrapped' })
    const control = await makeV1Name({ label: 'gm4-control' })
    await splitController(control, owner, manager)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [
        { kind: 'registration', label: labelOf(wrapped), type: 'wrapped' },
        {
          kind: 'registration',
          label: labelOf(control),
          ownerAddress: manager,
          registrantAddress: owner.address,
        },
      ],
    })

    await openMigrationFlow(page)
    await expect(rootRow(page, wrapped)).toBeVisible({ timeout: 30_000 })
    await expect(rootRow(page, control)).toBeVisible()
    await expect(
      restorationCheckbox(page),
      'only the unwrapped control may carry the opt-in',
    ).toHaveCount(1)
    await expect(
      page.locator(`label[title="${V1_NAME_WRAPPER}" i]`),
      'the NameWrapper must never be offered as a manager',
    ).toHaveCount(0)

    await selectOnlyRoots(page, [wrapped])
    await expect(restorationCheckbox(page)).toHaveCount(0)

    const fromBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n
    await upgradeCountingPrompts(page, wallet)

    const label = labelOf(wrapped)
    await assertV2Registered(label)
    await assertRoleBitmap({ label }, V1_NAME_WRAPPER, [])
    const approvals = await publicClient.getLogs({
      address: ETH_REGISTRY,
      event: APPROVAL_FOR_ALL,
      args: { account: owner.address },
      fromBlock,
    })
    expect(
      approvals,
      'no manager means no temporary HCA approval either',
    ).toHaveLength(0)
  })
})
