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
import { type Address, erc20Abi, parseAbi, parseUnits } from 'viem'
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
import { assertUnlockedMigration } from '../../../helpers/migration-assertions.js'
import {
  type MockV1Name,
  mockV1Subgraph,
} from '../../../helpers/mock-v1-subgraph.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]
const USDC = ensjsSepolia.usdc.address as Address
const RENEWER = ensjsSepolia.ensEthRenewerV1.address as Address
const BASE_REGISTRAR = ensjsSepolia.ensBaseRegistrarImplementation
  .address as Address
const USDC_DECIMALS = 6

const RENEWER_ABI = parseAbi([
  'function getRenewPrice(string label, uint64 duration, address paymentToken) view returns (uint256)',
])
const BASE_REGISTRAR_ABI = parseAbi([
  'function nameExpires(uint256 id) view returns (uint256)',
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

/** Mock the subgraph, align the browser clock with the chain, and open /migration. */
async function openMigration(page: Page, names: MockV1Name[]) {
  await mockV1Subgraph(page, names)
  await syncBrowserToChain(page)
  await page.goto(`${MANAGER_APP_URL}/migration`)
}

/** The checkbox for a name on /migration, once the list has rendered. */
const nameCheckbox = (page: Page, name: string) =>
  page.getByRole('checkbox', { name, exact: true })

/**
 * Open "What you'll approve", return the ordered step titles and the renewal
 * cost it quotes, then close it.
 */
async function readRequestsDialog(page: Page) {
  const trigger = page.getByRole('button', { name: /^\d+ requests?$/ })
  await expect(trigger).toBeVisible({ timeout: 60_000 })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: "What you'll approve" })
  await expect(dialog).toBeVisible()
  const steps = await dialog.locator('ol > li h3').allInnerTexts()
  const costText = await dialog
    .locator('div', { has: page.getByText('Estimated renewal cost') })
    .locator('dd')
    .first()
    .innerText()
  const quotedUsdc = parseUnits(costText.replace(/\s*USDC$/, ''), USDC_DECIMALS)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  return { steps, quotedUsdc }
}

/** Click "Upgrade N names" and authorize every wallet request until success. */
async function runUpgrade(page: Page, wallet: Web3ProviderBackend) {
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

  test('a grace-period name is offered for renewal from the dashboard and listed on /migration', {
    tag: ['@smoke'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const grace = await makeGraceV1Name({ label: 'mg-list', owner })
    await mockV1Subgraph(page, [graceMock(grace, owner.address)])
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
    await renew.click()

    // ── /migration: the grace name is listed, selected, and badged ──
    await expect(page).toHaveURL(/\/migration$/)
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
  })

  test('renews then upgrades a grace-period name, charging the USDC the dialog quoted', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const grace = await makeGraceV1Name({ label: 'mg-renew', owner })
    await openMigration(page, [graceMock(grace, owner.address)])

    await expect(nameCheckbox(page, grace.name)).toBeChecked({
      timeout: 60_000,
    })

    // The renewal steps come before every migration step.
    const { steps, quotedUsdc } = await readRequestsDialog(page)
    const renewAt = steps.indexOf('Renew 1 name')
    expect(renewAt, `steps: ${steps.join(' | ')}`).toBeGreaterThanOrEqual(0)
    expect(steps.at(-1)).toBe('Upgrade 1 name')
    expect(
      steps.slice(0, renewAt).every((s) => s === 'Approve renewal payment'),
    ).toBe(true)
    expect(quotedUsdc).toBeGreaterThan(0n)

    const usdcBefore = await usdcBalance(owner.address)
    const blockBefore = await publicClient.getBlockNumber()
    await runUpgrade(page, wallet)

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
      { name: active, ownerAddress: owner.address },
      graceMock(grace, owner.address, 'wrapped'),
    ]
    await mockV1Subgraph(page, names)
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

    // ── /migration: both selected; only the grace name carries the badge ──
    await page.goto(`${MANAGER_APP_URL}/migration`)
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

    const { steps } = await readRequestsDialog(page)
    const renewAt = steps.indexOf('Renew 1 name')
    expect(renewAt, `steps: ${steps.join(' | ')}`).toBeGreaterThanOrEqual(0)
    expect(steps.at(-1)).toBe('Upgrade 2 names')
    expect(
      steps.slice(0, renewAt).every((s) => s === 'Approve renewal payment'),
    ).toBe(true)

    await runUpgrade(page, wallet)

    // Only the grace name was renewed; both landed in V2. A stale NameWrapper
    // (renewed but not synced) makes the wrapped transfer revert, so this
    // migration succeeding is the wrapper-sync oracle.
    expect(await nameExpires(grace.tokenId)).toBeGreaterThan(grace.expiry)
    await assertUnlockedMigration(grace.label)
    await assertUnlockedMigration(active.replace(/\.eth$/, ''))
  })
})
