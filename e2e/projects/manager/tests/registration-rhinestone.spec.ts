/**
 * Standalone-HCA registration E2E test (user-paid USDC, no gas sponsorship).
 *
 * With VITE_FF_USE_EOA=false (default) the registration machine routes through
 * the scoped-SmartSession standalone HCA. The flow is:
 *   1. session authorization (eth_signTypedData_v4 — the one multi-chain
 *      authorization signed BEFORE route selection, via the EnableSessions gate)
 *   2. USDC funding permit  (eth_signTypedData_v4 — EIP-2612, wallet → HCA budget)
 *   3. commit leg           (session-signed request: permit + transferFrom +
 *      commit; deploys the HCA lazily)
 *   4. [commitment age wait — handled by the app]
 *   5. reveal batch         (session-signed: price re-read + deployProxy? →
 *      approve → register(wallet) → setters; no user tx)
 *
 * Two signatures, zero wallet transactions. The mockestrator impersonates the
 * HCA on the Anvil fork to fill each intent; it needs ETH in the HCA address to
 * pay impersonated gas (see `e2e/infra/scripts/fund-rhinestone-account.sh`).
 *
 * Prerequisites:
 *   - E2E infra running: `pnpm e2e:infra:up` (Anvil + Mockestrator)
 *   - Anvil snapshot baked with the STANDALONE-HCA deployment (StandaloneHCA
 *     Factory/Impl, HCAOwnerAndSessionValidator, new registrar/registry, Circle
 *     USDC) and `mockestrator/chains.json` USDC/DAI pointed at those addresses.
 *   - Manager app with VITE_FF_USE_EOA=false.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { permissionedRegistryGetStateSnippet } from '@ensdomains/ensjs-abi/v2'
import { expect, type Page } from '@playwright/test'
import { type Address, isAddressEqual, keccak256, toHex } from 'viem'
import { createMakeName } from '../../../fixtures/makeName.js'
import {
  authorizeTransactionsWhile,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import type { Time } from '../../../fixtures/time.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import { expectFlowSuccess } from '../../../helpers/flow-completion.js'
import { clickThroughEnableSessions } from '../../../helpers/manager-auth.js'
import {
  assertV2Registered,
  V2Status,
} from '../../../helpers/migration-assertions.js'
import { findSearchInput } from '../../../helpers/search-input.js'

const DOMAIN_TO_REGISTER = `rh-e2e-${Date.now().toString(36)}.eth`

test.describe('ENS name registration (Rhinestone HCA)', () => {
  test('registers a name via Rhinestone HCA headless wallet', {
    tag: ['@scenario:A2'],
  }, async ({ connectedPage: page, mockIndexer, accounts, wallet }) => {
    const nameOnly = DOMAIN_TO_REGISTER.replace(/\.eth$/i, '')
    const searchInput = await findSearchInput(page)
    await searchInput.click()
    await searchInput.fill(nameOnly)
    await page
      .getByText('Available')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText(DOMAIN_TO_REGISTER).click()

    await page.getByRole('button', { name: /pay with stablecoins/i }).click()
    // Smart-session gate: on the HCA path (VITE_FF_USE_EOA=false) clicking
    // "Pay with stablecoins" opens the EnableSessions modal BEFORE the token
    // picker. Click through it (the single ENABLE intent is auto-authorized via
    // PERMITTED_SIGN_KINDS); idempotent no-op in EOA mode.
    await clickThroughEnableSessions(page)
    await page.getByText('USDC', { exact: true }).click()

    createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(`[Registration] ${state} (seen: ${allStates.join(' → ')})`)
      },
    })

    await page.getByRole('button', { name: /register name/i }).click()

    // RegistrationDetails (including the completion banner) stays hidden while
    // the parallel notification-settings region is waiting for a choice.
    await page.getByRole('button', { name: 'Set up later' }).click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')

    // The registration itself needs no eth_sendTransaction on the HCA path
    // (payment is an auto-authorized EIP-2612 permit carried into the
    // sponsored register bundle). But when the wallet is still eligible for
    // the auto primary-name setup, the post-registration step sends two
    // owner-EOA transactions (forward + reverse) that must be authorized —
    // and the completion banner is gated on the whole flow finishing.
    let registrationComplete = false
    const authorizeSetupTxs = authorizeTransactionsWhile(
      page,
      wallet,
      () => registrationComplete,
    )
    await expectFlowSuccess(page, {
      success: successBanner.filter({ hasText: 'Registration Complete' }),
      failureTitle: 'Registration Failed',
      timeout: 240_000,
    })
    registrationComplete = true
    await authorizeSetupTxs

    // The completion banner is app-rendered text; the registry is the
    // ground truth. Confirms the HCA-signed reveal batch actually landed
    // the registration on chain, not just that the UI believes it did.
    await assertV2Registered(nameOnly)

    if (mockIndexer.enabled) {
      mockIndexer.addName({
        name: DOMAIN_TO_REGISTER,
        owner: accounts.getAddress('user'),
      })
    }
  })
})

/**
 * WEB-1148 — two people register the same name.
 *
 * Both commits land; the loser's reveal then fails because the winner already
 * owns the label. Before the fix nothing recognised that: the reveal failure
 * went to a plain retryable error, the failure screen offered "Try Again", and
 * every press re-submitted a reveal that can never succeed (and, on a retry
 * with no target, restarted the flow with a fresh paid commitment). Only a
 * refresh ended it.
 *
 * The fix routes a failed reveal through `verifyingRegistration`, which reads
 * the registry: a label owned by ANOTHER address is terminal (`nameUnavailable`,
 * RETRY refused) and the manager shows "Name No Longer Available" with no retry.
 * Nobody owning the label keeps the ordinary retryable error.
 *
 * What these reach that the unit tests don't: a real rival registration on the
 * fork, the real price re-read reverting inside `submitRevealBatch`, the real
 * registry read in the HCA verify actor, and the rendered failure screen — the
 * unit tests stub all four.
 *
 * Not tagged `@smoke`: each test sits through the real 60s commitment
 * cooldown, and the manager smoke budget has no room for it.
 */
const COMMIT_TX_ID = 'tx-reg-commit'
const REVEAL_TX_ID = 'tx-reg-register'
const ETH_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
  .address as Address
/** `getRegisterPrice(string,uint64,address)` — re-read at the start of the reveal. */
const GET_REGISTER_PRICE_SELECTOR = '61907b12'
const FAILURE_SCREEN_TEXT =
  /Registration Failed|Name No Longer Available|Registration Complete/

/** Must match `registrationPersistence.ts`. */
const RESUME_STORAGE_KEY = 'ens-apps:register-v2:resume:v1'
const readStoredRegistration = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), RESUME_STORAGE_KEY)

const readRegistryState = (label: string) =>
  publicClient.readContract({
    address: ETH_REGISTRY,
    abi: permissionedRegistryGetStateSnippet,
    functionName: 'getState',
    args: [BigInt(keccak256(toHex(label)))],
  })

/** Drive a fresh HCA registration as far as a confirmed on-chain commitment. */
async function registerUntilCommitConfirmed(page: Page, label: string) {
  const searchInput = await findSearchInput(page)
  await searchInput.click()
  await searchInput.fill(label)
  await page
    .getByText('Available')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByText(`${label}.eth`).click()

  await page.getByRole('button', { name: /pay with stablecoins/i }).click()
  await clickThroughEnableSessions(page)
  await page.getByText('USDC', { exact: true }).click()

  const monitor = createConsoleMonitor(page, { logConsoleMessages: false })
  await page.getByRole('button', { name: /register name/i }).click()
  await page.getByRole('button', { name: 'Set up later' }).click()
  await monitor.waitForTransactionState(COMMIT_TX_ID, 'success', 180_000)
  return monitor
}

test.describe('lost same-name registration race (WEB-1148)', () => {
  test('ends on "Name No Longer Available" with no retry when another address registers the name first', async ({
    connectedPage: page,
    accounts,
  }) => {
    test.setTimeout(300_000)
    const label = `rh-race-${Date.now().toString(36)}`
    const monitor = await registerUntilCommitConfirmed(page, label)

    // The rival registers the exact label during our cooldown. `makeName`'s
    // own clock sync is skipped: installing a fake browser clock mid-flow
    // would stall the app's cooldown timer.
    const noClockSync = { sync: async () => {} } as unknown as Time
    await createMakeName({ accounts, time: noClockSync })({
      label,
      exactLabel: true,
      owner: 'user2',
    })
    const rival = accounts.getAddress('user2')
    const afterRival = await readRegistryState(label)
    expect(afterRival.status).toBe(V2Status.REGISTERED)
    expect(isAddressEqual(afterRival.latestOwner, rival)).toBe(true)
    monitor.reset()

    const main = page.locator('main')
    await main
      .getByText(FAILURE_SCREEN_TEXT)
      .first()
      .waitFor({ state: 'visible', timeout: 180_000 })

    // The bug: "Registration Failed" + "Try Again", which can never succeed.
    await expect(
      main.getByText('Name No Longer Available', { exact: true }),
    ).toBeVisible()
    await expect(
      main.getByText(`${label}.eth was registered by another address first`),
    ).toBeVisible()
    // Positive sign the action row rendered before asserting what's absent.
    await expect(
      main.getByRole('button', { name: 'Back to Quote' }),
    ).toBeVisible()
    await expect(main.getByRole('button', { name: 'Try Again' })).toHaveCount(0)
    await expect(
      main.getByText('Registration Failed', { exact: true }),
    ).toHaveCount(0)

    // Terminal means terminal: nothing is re-submitted on its own while the
    // user reads the screen — no second paid commitment, no reveal.
    await page.waitForTimeout(5_000)
    const resubmitted = monitor
      .getTransactionLines()
      .filter(
        (l) =>
          (l.txId === COMMIT_TX_ID || l.txId === REVEAL_TX_ID) &&
          l.state !== 'success',
      )
    expect(
      resubmitted,
      `nothing may be re-submitted after the lost race, saw: ${resubmitted
        .map((l) => `${l.txId}=${l.state}`)
        .join(', ')}`,
    ).toEqual([])

    // The chain is unchanged: the rival still owns it.
    const final = await readRegistryState(label)
    expect(isAddressEqual(final.latestOwner, rival)).toBe(true)

    // The only way out still works, and lands on the name's owner profile:
    // the register route redirects a name that is no longer available.
    await main.getByRole('button', { name: 'Back to Quote' }).click()
    await page.waitForURL(new RegExp(`/${label}\\.eth$`), { timeout: 15_000 })
    await expect(
      main.getByText('Name No Longer Available', { exact: true }),
    ).toHaveCount(0)
  })

  /**
   * Guard (green before the fix too): the new lost-race branch must not
   * swallow an ordinary reveal failure. With nobody owning the label, an RPC
   * flake during the reveal stays a retryable "Registration Failed" carrying
   * the real error, and Try Again completes the registration from the reveal —
   * without a second commitment.
   */
  test('still offers Try Again for a reveal failure nobody else caused, and the retry completes without re-committing', async ({
    connectedPage: page,
    accounts,
    wallet,
  }) => {
    test.setTimeout(300_000)
    const label = `rh-flake-${Date.now().toString(36)}`
    const monitor = await registerUntilCommitConfirmed(page, label)

    // Fail the reveal's price re-read at the RPC layer until we say otherwise.
    let flaky = true
    await page.route('**/*', async (route) => {
      const body = route.request().postData() ?? ''
      if (flaky && body.includes(GET_REGISTER_PRICE_SELECTOR)) {
        return route.fulfill({ status: 503, body: 'injected flake' })
      }
      return route.fallback()
    })

    const main = page.locator('main')
    await main
      .getByText(FAILURE_SCREEN_TEXT)
      .first()
      .waitFor({ state: 'visible', timeout: 180_000 })

    await expect(
      main.getByText('Registration Failed', { exact: true }),
    ).toBeVisible()
    // The submission error is kept, not replaced by the registry check's
    // "not registered" reason.
    await expect(main.getByText(/Status: 503/)).toBeVisible()
    await expect(main.getByRole('button', { name: 'Try Again' })).toBeVisible()
    await expect(
      main.getByText('Name No Longer Available', { exact: true }),
    ).toHaveCount(0)
    expect((await readRegistryState(label)).status).toBe(V2Status.AVAILABLE)

    flaky = false
    monitor.reset()
    await main.getByRole('button', { name: 'Try Again' }).click()

    let registrationComplete = false
    const authorizeSetupTxs = authorizeTransactionsWhile(
      page,
      wallet,
      () => registrationComplete,
    )
    await expectFlowSuccess(page, {
      success: page
        .locator('p.text-ens-peridot-text-dark')
        .filter({ hasText: 'Registration Complete' }),
      failureTitle: 'Registration Failed',
      timeout: 180_000,
    })
    registrationComplete = true
    await authorizeSetupTxs

    await assertV2Registered(label)
    const state = await readRegistryState(label)
    expect(isAddressEqual(state.latestOwner, accounts.getAddress('user'))).toBe(
      true,
    )
    expect(
      monitor.getStatesFor(COMMIT_TX_ID),
      'the retry resumes at the reveal; it must not pay for a new commitment',
    ).toEqual([])
    expect(monitor.getStatesFor(REVEAL_TX_ID)).toContain('success')
  })

  /**
   * Guard (green before the fix too — the route loader does this, not the
   * PR): a reload on the lost-race screen must not resume into the doomed
   * reveal. The persisted record says `stage: error`; the register route sees
   * the name is taken, redirects to its profile, and the record is dropped.
   */
  test('a reload after losing the race shows the new owner and re-submits nothing', async ({
    connectedPage: page,
    accounts,
  }) => {
    test.setTimeout(300_000)
    const label = `rh-reload-${Date.now().toString(36)}`
    const monitor = await registerUntilCommitConfirmed(page, label)

    const noClockSync = { sync: async () => {} } as unknown as Time
    await createMakeName({ accounts, time: noClockSync })({
      label,
      exactLabel: true,
      owner: 'user2',
    })

    const main = page.locator('main')
    await main
      .getByText(FAILURE_SCREEN_TEXT)
      .first()
      .waitFor({ state: 'visible', timeout: 180_000 })
    expect(
      await readStoredRegistration(page),
      'the failed run must have been persisted for the reload to matter',
    ).not.toBeNull()

    monitor.reset()
    await page.reload()

    await page.waitForURL(new RegExp(`/${label}\\.eth$`), { timeout: 30_000 })
    // Positive sign the profile rendered: the rival as owner.
    const rival = accounts.getAddress('user2')
    await expect(
      main.getByText(`${rival.slice(0, 6)}...${rival.slice(-4)}`).first(),
    ).toBeVisible({ timeout: 30_000 })
    await expect(main.getByText(FAILURE_SCREEN_TEXT)).toHaveCount(0)

    // Give a wrongly-resumed flow time to show itself.
    await page.waitForTimeout(10_000)
    expect(
      monitor.getTransactionLines(),
      'a reload must not resume into the commit or the reveal',
    ).toEqual([])
    expect(await readStoredRegistration(page)).toBeNull()
    expect(
      isAddressEqual((await readRegistryState(label)).latestOwner, rival),
    ).toBe(true)
  })
})
