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
import type { Page } from '@playwright/test'
import { type Address, parseAbiItem } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_NAME_WRAPPER,
} from '../../../fixtures/makeV1Name.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { splitController } from '../../../fixtures/v1-tails.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { assertV2Registered } from '../../../helpers/migration-assertions.js'
import {
  openMigrationFlow,
  rootRow,
  selectOnlyRoots,
  upgradeCountingPrompts,
} from '../../../helpers/migration-flow.js'
import { assertRoleBitmap } from '../../../helpers/role-assertions.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const ETH_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
  .address as Address

const APPROVAL_FOR_ALL = parseAbiItem(
  'event ApprovalForAll(address indexed account, address indexed operator, bool approved)',
)

const labelOf = (name: string) => name.replace(/\.eth$/, '')

/** The restoration opt-in on a row: "Keep 0x… as a manager. …". */
const restorationCheckbox = (page: Page) =>
  page.getByRole('checkbox', { name: /^Keep .* as a manager/ })

test.describe('ENS V1 → V2 migration — carrying a V1 manager (§G.GM)', () => {
  test.describe.configure({ timeout: 300_000 })

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
    await selectOnlyRoots(page, [wrapped, control])
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
