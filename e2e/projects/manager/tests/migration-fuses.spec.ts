/**
 * ENS V1→V2 Migration — Fuse Combinations
 *
 * Tests that locked names with resolver restrictions migrate successfully
 * and preserve their resolver in V2.
 *
 * Each test:
 * 1. Registers a locked V1 name on the Anvil fork with the given fuse combo.
 * 2. Mocks bigname's V1 view with the correct full NameWrapper fuse bitmap
 *    (owner fuses | PARENT_CANNOT_CONTROL | IS_DOT_ETH = owner fuses | 0x30000).
 *    The mock helper ORs these in automatically when `fuses` is provided.
 * 3. Runs the migration UI flow.
 * 4. Asserts the name is REGISTERED with a WrapperRegistry and V1 resolver.
 *
 * Prerequisites:
 *   - Anvil fork running with V1 + V2 contracts
 *   - Manager app running on MANAGER_APP_URL (default localhost:3000)
 */
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  FUSES,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import {
  authorizeTransaction,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import {
  assertLockedMigration,
  assertV2Resolver,
} from '../../../helpers/migration-assertions.js'
import { mockV1Names } from '../../../helpers/mock-v1-names.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const HEADLESS_USER_ADDRESS = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
).address

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runMigrationFlow(
  page: import('@playwright/test').Page,
  wallet: import('@ensdomains/headless-web3-provider').Web3ProviderBackend,
) {
  await page.goto(`${MANAGER_APP_URL}/dashboard`)
  await page.waitForLoadState('networkidle')

  const upgradeButton = page
    .getByRole('button', { name: 'Upgrade Names' })
    .first()
  await upgradeButton.waitFor({ state: 'visible', timeout: 10_000 })
  await upgradeButton.click()

  await page.waitForTimeout(2_000)

  const confirmButton = page.getByRole('button', { name: 'Upgrade Names' })
  await confirmButton.waitFor({ state: 'visible', timeout: 10_000 })
  await Promise.all([
    confirmButton.click(),
    authorizeTransaction(wallet, 90_000),
  ])

  const successIndicator = page.getByText("You're on ENS v2!")
  await successIndicator.waitFor({ state: 'visible', timeout: 60_000 })

  const doneButton = page.getByRole('button', { name: 'Done' })
  await doneButton.waitFor({ state: 'visible', timeout: 10_000 })
  await doneButton.click()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('ENS V1→V2 Migration — Fuse Combinations', () => {
  test.describe.configure({ timeout: 300_000 })

  test('locked + CANNOT_SET_RESOLVER migrates and preserves V1 resolver', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })
    const v1Name = await makeV1Name({
      label: 'fuse-csr',
      type: 'locked',
      fuses: FUSES.CANNOT_SET_RESOLVER,
    })
    const label = v1Name.replace('.eth', '')
    console.log(
      `[migration-fuses] locked+CANNOT_SET_RESOLVER name created: ${v1Name}`,
    )

    await mockV1Names(page, [
      {
        name: v1Name,
        ownerAddress: HEADLESS_USER_ADDRESS,
        type: 'locked',
        fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
      },
    ])

    await runMigrationFlow(page, wallet)
    await assertLockedMigration(label)

    // CANNOT_SET_RESOLVER means the V1 resolver cannot be changed by the owner.
    // After migration the V2 registry resolver slot should point to the V1 public
    // resolver so that existing records remain resolvable without a re-write.
    await assertV2Resolver(label, V1_PUBLIC_RESOLVER)
    console.log(
      `[migration-fuses] ✅ locked+CANNOT_SET_RESOLVER migration + resolver verified for ${v1Name}`,
    )
  })

  test('locked + all child fuses migrates and produces locked V2 state', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })
    const allChildFuses =
      FUSES.CANNOT_BURN_FUSES |
      FUSES.CANNOT_TRANSFER |
      FUSES.CANNOT_SET_RESOLVER |
      FUSES.CANNOT_CREATE_SUBDOMAIN |
      FUSES.CANNOT_APPROVE |
      FUSES.CAN_EXTEND_EXPIRY

    const v1Name = await makeV1Name({
      label: 'fuse-all',
      type: 'locked',
      fuses: allChildFuses,
    })
    const label = v1Name.replace('.eth', '')
    console.log(
      `[migration-fuses] locked+all-child-fuses name created: ${v1Name}`,
    )

    await mockV1Names(page, [
      {
        name: v1Name,
        ownerAddress: HEADLESS_USER_ADDRESS,
        type: 'locked',
        // Pass owner-controlled fuses; mock ORs in PARENT_CANNOT_CONTROL | IS_DOT_ETH
        fuses: FUSES.CANNOT_UNWRAP | allChildFuses,
      },
    ])

    await runMigrationFlow(page, wallet)
    await assertLockedMigration(label)
    await assertV2Resolver(label, V1_PUBLIC_RESOLVER)
    console.log(
      `[migration-fuses] ✅ locked+all-child-fuses migration verified for ${v1Name}`,
    )
  })
})
