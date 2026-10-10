/**
 * Grace-period V1 names in the migration flow (WEB-424, PR #1274).
 *
 * The bug: a V1 .eth name inside its 90-day grace period is classified
 * `expired-registration`, which made it ineligible and so invisible to
 * migration. An owner whose only V1 names were in grace saw no upgrade banner
 * and an empty /migration page, with no way to keep the name short of renewing
 * it somewhere else first.
 *
 * The fix: `useEligibleV1Names` now returns `gracePeriodNames` alongside the
 * eligible list. The dashboard banner offers "Renew Names", /migration lists
 * grace names with a "Renew before upgrade" badge, and starting the upgrade
 * quotes the renewal in USDC, asks for a USDC approval only when the allowance
 * is short, calls `ETHRenewerV1.renewBatch`, re-reads the renewed names, then
 * rebuilds and runs the normal migration plan. A wallet without enough USDC is
 * blocked before anything is sent.
 *
 * What these reach that the unit tests don't: a real in-grace name on the
 * fork; the real renewer (`isRenewable`, `getRenewPrice`, `renewBatch`,
 * wrapper sync) and USDC token; the USDC actually charged against the figure
 * the dialog quotes; and the renewed name actually landing in the V2 registry.
 *
 * Seeding: `makeGraceV1Name` (not `makeV1Name({ duration: -N })`, which moves
 * the shared clock 28+ days per name). The browser clock is installed at chain
 * time, because the app classifies grace against `Date.now()`.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Web3ProviderBackend } from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import { type Address, erc20Abi, labelhash, parseAbi, parseUnits } from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
import {
  type GraceV1Name,
  makeGraceV1Name,
  syncBrowserToChain,
} from '../../../fixtures/makeGraceV1Name.js'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  authorizeTransactionsWhile,
  expect,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import {
  assertLockedMigration,
  assertUnlockedMigration,
  assertV2Reserved,
} from '../../../helpers/migration-assertions.js'
import type { MockV1Name } from '../../../helpers/mock-v1-subgraph.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]
const USDC = ensjsSepolia.usdc.address as Address
const RENEWER = ensjsSepolia.ensEthRenewerV1.address as Address
const BASE_REGISTRAR = ensjsSepolia.ensBaseRegistrarImplementation
  .address as Address
const USDC_DECIMALS = 6

/**
 * Set to a directory to save QA screenshots at each test's key states
 * (1440×900, router devtools hidden). Unset, `qaShot` is a no-op.
 */
const QA_SHOTS_DIR = process.env.QA_SHOTS_DIR
if (QA_SHOTS_DIR) test.use({ viewport: { width: 1440, height: 900 } })

const RENEWER_ABI = parseAbi([
  'function getRenewPrice(string label, uint64 duration, address paymentToken) view returns (uint256)',
])
const BASE_REGISTRAR_ABI = parseAbi([
  'function nameExpires(uint256 id) view returns (uint256)',
  'function controllers(address) view returns (bool)',
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const usdcBalance = (address: Address) =>
  publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  })

const nameExpires = (tokenId: bigint) =>
  publicClient.readContract({
    address: BASE_REGISTRAR,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'nameExpires',
    args: [tokenId],
  })

const chainNow = async () =>
  (await publicClient.getBlock({ blockTag: 'latest' })).timestamp

const transferUsdc = async (
  from: PrivateKeyAccount,
  to: Address,
  amount: bigint,
) => {
  if (amount === 0n) return
  const hash = await walletClient.writeContract({
    account: from,
    address: USDC,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amount],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success')
    throw new Error(`USDC transfer ${hash} reverted`)
}

const graceMock = (
  grace: GraceV1Name,
  owner: Address,
  type: MockV1Name['type'] = 'unwrapped',
): MockV1Name => ({
  name: grace.name,
  ownerAddress: owner,
  type,
  expiryDate: Number(grace.expiry),
})

/** Mock the subgraph, align the browser clock with the chain, and open /upgrade. */
async function openMigration(page: Page, names: MockV1Name[]) {
  await serveV1Names(page, names)
  await syncBrowserToChain(page)
  await page.goto(`${MANAGER_APP_URL}/upgrade`)
}

async function qaShot(page: Page, name: string) {
  if (!QA_SHOTS_DIR) return
  await page.addStyleTag({
    content: 'footer.TanStackRouterDevtools { display: none !important; }',
  })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${QA_SHOTS_DIR}/${name}.png` })
}

/**
 * Environment blocker, not an app defect (`e2e/docs/e2e-defects.md`,
 * "ETHRenewerV1 is no longer a BaseRegistrar controller on live Sepolia").
 * On 2026-10-01 the Sepolia BaseRegistrar owner called
 * `removeController(ETHRenewerV1)` (tx 0x8e740ce7…834254, block 11821651), so
 * `renewBatch` cannot renew and the app reports "Couldn't estimate the network
 * fee". The fork inherits that from live Sepolia.
 *
 * Checked on chain per test: while the role is missing, the test is expected
 * to fail with its assertions unchanged; once Sepolia restores the role, the
 * mark switches off by itself and the test must pass again.
 */
async function expectFailureWhileRenewerDeauthorised() {
  const authorised = await publicClient.readContract({
    address: BASE_REGISTRAR,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'controllers',
    args: [RENEWER],
  })
  test.fail(
    !authorised,
    'Environment blocker: live Sepolia removed ETHRenewerV1 as a BaseRegistrar controller (2026-10-01), so renewBatch cannot renew. See e2e-defects.md.',
  )
}

/** Subgraph entry for an active V1 name, with its real on-chain expiry. */
async function activeMock(
  name: string,
  owner: Address,
  type: MockV1Name['type'] = 'unwrapped',
): Promise<MockV1Name> {
  const expiry = await nameExpires(
    BigInt(labelhash(name.replace(/\.eth$/, ''))),
  )
  return { name, ownerAddress: owner, type, expiryDate: Number(expiry) }
}

/** Tick or untick a name on /migration (the input itself is visually hidden). */
async function setNameSelected(page: Page, name: string, selected: boolean) {
  const checkbox = nameCheckbox(page, name)
  if ((await checkbox.isChecked()) !== selected) {
    await checkbox.locator('xpath=..').click()
  }
  await expect(checkbox).toBeChecked({ checked: selected })
}

/** The checkbox for a name on /migration, once the list has rendered. */
const nameCheckbox = (page: Page, name: string) =>
  page.getByRole('checkbox', { name, exact: true })

/**
 * Open "What you'll approve", return the ordered step titles and the renewal
 * cost it quotes, then close it.
 */
async function readRequestsDialog(page: Page, shot?: string) {
  const trigger = page.getByRole('button', { name: /^\d+ requests?$/ })
  await expect(trigger).toBeVisible({ timeout: 60_000 })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: "What you'll approve" })
  await expect(dialog).toBeVisible()
  const steps = await dialog.locator('ol > li h3').allInnerTexts()
  const cost = dialog
    .locator('div', { has: page.getByText('Estimated renewal cost') })
    .locator('dd')
  // Absent when nothing selected needs renewal.
  const quotedUsdc =
    (await cost.count()) > 0
      ? parseUnits(
          (await cost.first().innerText()).replace(/\s*USDC$/, ''),
          USDC_DECIMALS,
        )
      : null
  if (shot) await qaShot(page, shot)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  return { steps, quotedUsdc }
}

/** Click "Upgrade N names" and authorize every wallet request until success. */
async function runUpgrade(
  page: Page,
  wallet: Web3ProviderBackend,
  shot?: string,
) {
  const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/i })
  await expect(upgrade).toBeEnabled({ timeout: 60_000 })
  let done = false
  const authorizeAll = authorizeTransactionsWhile(page, wallet, () => done)
  await upgrade.click()
  await expect(
    page.getByRole('heading', {
      name: /your names? (has|have) been upgraded/i,
    }),
  ).toBeVisible({ timeout: 180_000 })
  done = true
  await authorizeAll
  if (shot) await qaShot(page, shot)
}

/**
 * USDC actually owed for the renewal that landed, priced from chain data: the
 * renewer charges `getRenewPrice(label, duration)`, and the duration is the
 * expiry delta it applied. Priced at a block before the upgrade, because once
 * the name is migrated the V1 renewer reverts `NameNotRenewable`.
 */
async function chargedForRenewal(
  grace: GraceV1Name,
  newExpiry: bigint,
  blockNumber: bigint,
) {
  return publicClient.readContract({
    address: RENEWER,
    abi: RENEWER_ABI,
    functionName: 'getRenewPrice',
    args: [grace.label, newExpiry - grace.expiry, USDC],
    blockNumber,
  })
}

/**
 * The onboarding "Welcome to the new ENS app!" dialog opens over the dashboard
 * whenever an eligible name exists, and makes everything behind it inert.
 */
async function dismissWelcomeDialog(page: Page) {
  const welcome = page
    .getByRole('dialog')
    .filter({ hasText: 'Welcome to the new ENS app!' })
  try {
    await welcome.waitFor({ state: 'visible', timeout: 10_000 })
  } catch {
    return
  }
  await page.keyboard.press('Escape')
  await expect(welcome).toBeHidden()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Grace-period names in migration (WEB-424)', () => {
  test.describe.configure({ timeout: 300_000 })

  test('a grace-period name is offered for renewal from the dashboard and listed on /upgrade', {
    tag: ['@smoke'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const grace = await makeGraceV1Name({ label: 'mg-list', owner })
    await serveV1Names(page, [graceMock(grace, owner.address)])
    await syncBrowserToChain(page)

    // ── Dashboard: the page has loaded the name (positive sign) … ──
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    const main = page.locator('main')
    await expect(main.getByText(grace.name).first()).toBeVisible({
      timeout: 60_000,
    })
    // … and, with no other V1 name, the banner offers renewal (pre-fix: the
    // banner required an eligible name, so it never rendered).
    await expect(
      main.getByText(
        'Renew your grace-period name before upgrading to your new ENS profile.',
      ),
    ).toBeVisible({ timeout: 30_000 })
    const renew = main.getByRole('button', { name: 'Renew Names' })
    await expect(renew).toBeVisible()
    await qaShot(page, 'list-1-dashboard')
    await renew.click()

    // ── /upgrade: the grace name is listed, selected, and badged ──
    // #1307 renamed /migration to /upgrade (the old path redirects).
    await expect(page).toHaveURL(/\/upgrade$/)
    await expect(
      main.getByRole('heading', {
        level: 1,
        name: 'Renew your names before upgrading',
      }),
    ).toBeVisible({ timeout: 60_000 })
    const checkbox = nameCheckbox(page, grace.name)
    await expect(checkbox).toBeChecked()
    await expect(checkbox).toHaveAccessibleDescription(/Renew before upgrade/)
    await expect(
      main.getByRole('button', { name: 'Upgrade 1 name' }),
    ).toBeVisible()
    await qaShot(page, 'list-2-migration')
  })

  test('renews then upgrades a grace-period name, charging the USDC the dialog quoted', {
    tag: ['@scenario:GA6', '@scenario:B17'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    await expectFailureWhileRenewerDeauthorised()
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const grace = await makeGraceV1Name({ label: 'mg-renew', owner })
    await openMigration(page, [graceMock(grace, owner.address)])

    await expect(nameCheckbox(page, grace.name)).toBeChecked({
      timeout: 60_000,
    })

    // The renewal steps come before every migration step.
    const { steps, quotedUsdc } = await readRequestsDialog(
      page,
      'renew-1-dialog',
    )
    if (quotedUsdc === null) throw new Error('no renewal cost quoted')
    const renewAt = steps.indexOf('Renew 1 name')
    expect(renewAt, `steps: ${steps.join(' | ')}`).toBeGreaterThanOrEqual(0)
    expect(steps.at(-1)).toBe('Upgrade 1 name')
    expect(
      steps.slice(0, renewAt).every((s) => s === 'Approve renewal payment'),
    ).toBe(true)
    expect(quotedUsdc).toBeGreaterThan(0n)

    const usdcBefore = await usdcBalance(owner.address)
    const blockBefore = await publicClient.getBlockNumber()
    await runUpgrade(page, wallet, 'renew-2-success')

    // ── Chain: the registrar expiry moved past now … ──
    const newExpiry = await nameExpires(grace.tokenId)
    expect(newExpiry).toBeGreaterThan(grace.expiry)
    expect(newExpiry).toBeGreaterThan(await chainNow())

    // … the USDC that left the wallet is exactly the renewal price for the
    // duration applied, and matches the dialog's quote (the quote refreshes
    // every 30s, so allow 1% drift for a few seconds of extra duration) …
    const spent = usdcBefore - (await usdcBalance(owner.address))
    expect(spent).toBe(await chargedForRenewal(grace, newExpiry, blockBefore))
    const drift = spent > quotedUsdc ? spent - quotedUsdc : quotedUsdc - spent
    expect(drift * 100n).toBeLessThanOrEqual(quotedUsdc)

    // … and the renewed name actually migrated.
    await assertUnlockedMigration(grace.label)
  })

  test('blocks the upgrade when the wallet cannot pay for the renewal', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const holder = privateKeyToAccount(accounts.getPrivateKey('user2'))
    const grace = await makeGraceV1Name({ label: 'mg-nousdc', owner })

    const parked = await usdcBalance(owner.address)
    await transferUsdc(owner, holder.address, parked)
    try {
      await openMigration(page, [graceMock(grace, owner.address)])

      // Loaded: the name is listed and selected …
      await expect(nameCheckbox(page, grace.name)).toBeChecked({
        timeout: 60_000,
      })
      // … the shortfall is called out, and the action is disabled.
      await expect(
        page.getByRole('alert').filter({
          hasText: 'Not enough USDC to renew these names.',
        }),
      ).toBeVisible({ timeout: 60_000 })
      const blocked = page.getByRole('button', { name: 'Insufficient USDC' })
      await expect(blocked).toBeDisabled()
      await qaShot(page, 'nousdc-1-blocked')

      // Nothing reached the wallet, and the name is still in grace.
      await page.waitForTimeout(3_000)
      expect(wallet.getPendingRequestCount()).toBe(0)
      expect(await nameExpires(grace.tokenId)).toBe(grace.expiry)
    } finally {
      await transferUsdc(holder, owner.address, parked)
    }
  })

  test('upgrades an active name and a wrapped grace-period name together, renewing only the grace one', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    await expectFailureWhileRenewerDeauthorised()
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const active = await createMakeV1Name({ userAccount: owner })({
      label: 'mg-active',
    })
    const grace = await makeGraceV1Name({
      label: 'mg-wrapped',
      owner,
      wrapped: true,
    })
    const names: MockV1Name[] = [
      await activeMock(active, owner.address),
      graceMock(grace, owner.address, 'wrapped'),
    ]
    await serveV1Names(page, names)
    await syncBrowserToChain(page)

    // ── Dashboard: upgrade copy, plus the renewal note for the grace name ──
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    const main = page.locator('main')
    await dismissWelcomeDialog(page)
    await expect(main.getByText(grace.name).first()).toBeVisible({
      timeout: 60_000,
    })
    await expect(
      main.getByText('1 name needs renewal before it can be upgraded.'),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      main.getByRole('button', { name: 'Upgrade Names' }),
    ).toBeVisible()
    await qaShot(page, 'mixed-1-dashboard')

    // ── /migration: both selected; only the grace name carries the badge ──
    await page.goto(`${MANAGER_APP_URL}/upgrade`)
    await expect(
      main.getByRole('heading', {
        level: 1,
        name: 'Your names are ready to upgrade',
      }),
    ).toBeVisible({ timeout: 60_000 })
    await expect(nameCheckbox(page, grace.name)).toBeChecked()
    await expect(nameCheckbox(page, active)).toBeChecked()
    await expect(nameCheckbox(page, grace.name)).toHaveAccessibleDescription(
      /Renew before upgrade/,
    )
    await expect(nameCheckbox(page, active)).not.toHaveAccessibleDescription(
      /Renew before upgrade/,
    )

    await qaShot(page, 'mixed-2-migration')
    const { steps } = await readRequestsDialog(page, 'mixed-3-dialog')
    const renewAt = steps.indexOf('Renew 1 name')
    expect(renewAt, `steps: ${steps.join(' | ')}`).toBeGreaterThanOrEqual(0)
    expect(steps.at(-1)).toBe('Upgrade 2 names')
    expect(
      steps.slice(0, renewAt).every((s) => s === 'Approve renewal payment'),
    ).toBe(true)

    await runUpgrade(page, wallet, 'mixed-4-success')

    // Only the grace name was renewed; both landed in V2. A stale NameWrapper
    // (renewed but not synced) makes the wrapped transfer revert, so this
    // migration succeeding is the wrapper-sync oracle.
    expect(await nameExpires(grace.tokenId)).toBeGreaterThan(grace.expiry)
    await assertUnlockedMigration(grace.label)
    await assertUnlockedMigration(active.replace(/\.eth$/, ''))
  })

  test('bulk: two active and three grace-period names (unwrapped, wrapped, locked) upgrade together', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    await expectFailureWhileRenewerDeauthorised()
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const activeU = await makeV1Name({ label: 'mg-bulk-au' })
    const activeW = await makeV1Name({ label: 'mg-bulk-aw', type: 'wrapped' })
    const graceU = await makeGraceV1Name({ label: 'mg-bulk-gu', owner })
    const graceW = await makeGraceV1Name({
      label: 'mg-bulk-gw',
      owner,
      wrapped: true,
    })
    const graceL = await makeGraceV1Name({
      label: 'mg-bulk-gl',
      owner,
      locked: true,
    })
    const graces = [graceU, graceW, graceL]
    const actives = [activeU, activeW]
    await openMigration(page, [
      await activeMock(activeU, owner.address),
      await activeMock(activeW, owner.address, 'wrapped'),
      graceMock(graceU, owner.address),
      graceMock(graceW, owner.address, 'wrapped'),
      graceMock(graceL, owner.address, 'locked'),
    ])

    // Loaded: the active names are listed (pre-fix, only these two appear) …
    const main = page.locator('main')
    for (const name of actives) {
      await expect(nameCheckbox(page, name)).toBeChecked({ timeout: 60_000 })
    }
    await qaShot(page, 'bulk-1-migration')
    // … and all five are selectable, with the badge on exactly the grace three.
    await expect(
      main.getByRole('heading', {
        level: 1,
        name: 'Your names are ready to upgrade',
      }),
    ).toBeVisible()
    for (const { name } of graces) {
      await expect(nameCheckbox(page, name)).toBeChecked()
      await expect(nameCheckbox(page, name)).toHaveAccessibleDescription(
        /Renew before upgrade/,
      )
    }
    for (const name of actives) {
      await expect(nameCheckbox(page, name)).not.toHaveAccessibleDescription(
        /Renew before upgrade/,
      )
    }

    // One batched renewal for the three grace names, before any migration.
    const { steps, quotedUsdc } = await readRequestsDialog(
      page,
      'bulk-2-dialog',
    )
    if (quotedUsdc === null) throw new Error('no renewal cost quoted')
    const renewAt = steps.indexOf('Renew 3 names')
    expect(renewAt, `steps: ${steps.join(' | ')}`).toBeGreaterThanOrEqual(0)
    expect(
      steps.slice(0, renewAt).every((s) => s === 'Approve renewal payment'),
    ).toBe(true)
    expect(steps.at(-1)).toBe('Upgrade 5 names')

    const usdcBefore = await usdcBalance(owner.address)
    const blockBefore = await publicClient.getBlockNumber()
    await runUpgrade(page, wallet, 'bulk-3-success')

    // Every grace name renewed, and the USDC spent is the sum of their prices.
    let owed = 0n
    for (const grace of graces) {
      const newExpiry = await nameExpires(grace.tokenId)
      expect(newExpiry, grace.name).toBeGreaterThan(await chainNow())
      owed += await chargedForRenewal(grace, newExpiry, blockBefore)
    }
    const spent = usdcBefore - (await usdcBalance(owner.address))
    expect(spent).toBe(owed)
    const drift = spent > quotedUsdc ? spent - quotedUsdc : quotedUsdc - spent
    expect(drift * 100n).toBeLessThanOrEqual(quotedUsdc)

    // All five landed in V2; the locked one under a WrapperRegistry.
    for (const name of actives) {
      await assertUnlockedMigration(name.replace(/\.eth$/, ''))
    }
    await assertUnlockedMigration(graceU.label)
    await assertUnlockedMigration(graceW.label)
    await assertLockedMigration(graceL.label)
  })

  test('deselecting the grace-period name upgrades only the active name, with no renewal', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const active = await createMakeV1Name({ userAccount: owner })({
      label: 'mg-desel-a',
    })
    const grace = await makeGraceV1Name({ label: 'mg-desel-g', owner })
    await openMigration(page, [
      await activeMock(active, owner.address),
      graceMock(grace, owner.address),
    ])

    await expect(nameCheckbox(page, active)).toBeChecked({ timeout: 60_000 })
    // Positive control: the grace name is offered and selected by default.
    await expect(nameCheckbox(page, grace.name)).toBeChecked()
    await setNameSelected(page, grace.name, false)

    // No renewal in the plan once the grace name is out of the selection.
    const { steps, quotedUsdc } = await readRequestsDialog(
      page,
      'desel-1-dialog',
    )
    expect(quotedUsdc).toBeNull()
    expect(steps, steps.join(' | ')).not.toContain('Approve renewal payment')
    expect(steps.some((s) => s.startsWith('Renew'))).toBe(false)
    expect(steps.at(-1)).toBe('Upgrade 1 name')

    const usdcBefore = await usdcBalance(owner.address)
    await runUpgrade(page, wallet)

    // Active migrated; grace untouched (no charge, no renewal, still RESERVED).
    await assertUnlockedMigration(active.replace(/\.eth$/, ''))
    expect(await usdcBalance(owner.address)).toBe(usdcBefore)
    expect(await nameExpires(grace.tokenId)).toBe(grace.expiry)
    await assertV2Reserved(grace.label)

    // Back on /migration the grace name is still offered, now on its own.
    await page.goto(`${MANAGER_APP_URL}/upgrade`)
    await expect(
      page.locator('main').getByRole('heading', {
        level: 1,
        name: 'Renew your names before upgrading',
      }),
    ).toBeVisible({ timeout: 60_000 })
    await expect(nameCheckbox(page, grace.name)).toBeChecked()
    await qaShot(page, 'desel-2-after')
  })

  test('several grace-period names on their own: plural banner and one batched renewal', async ({
    migrationConnectedPage: page,
    accounts,
  }) => {
    await expectFailureWhileRenewerDeauthorised()
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const first = await makeGraceV1Name({ label: 'mg-multi-1', owner })
    const second = await makeGraceV1Name({
      label: 'mg-multi-2',
      owner,
      wrapped: true,
    })
    await serveV1Names(page, [
      graceMock(first, owner.address),
      graceMock(second, owner.address, 'wrapped'),
    ])
    await syncBrowserToChain(page)

    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    const main = page.locator('main')
    await expect(main.getByText(first.name).first()).toBeVisible({
      timeout: 60_000,
    })
    await expect(
      main.getByText(
        'Renew your 2 grace-period names before upgrading to your new ENS profile.',
      ),
    ).toBeVisible({ timeout: 30_000 })
    await qaShot(page, 'multi-1-dashboard')
    await main.getByRole('button', { name: 'Renew Names' }).click()

    await expect(
      main.getByRole('heading', {
        level: 1,
        name: 'Renew your names before upgrading',
      }),
    ).toBeVisible({ timeout: 60_000 })
    await expect(nameCheckbox(page, first.name)).toBeChecked()
    await expect(nameCheckbox(page, second.name)).toBeChecked()
    const { steps, quotedUsdc } = await readRequestsDialog(
      page,
      'multi-2-dialog',
    )
    expect(steps, steps.join(' | ')).toContain('Renew 2 names')
    expect(steps.at(-1)).toBe('Upgrade 2 names')
    expect(quotedUsdc).toBeGreaterThan(0n)
  })
})
