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
import { expect, type Page, type Request, type Route } from '@playwright/test'
import { type Address, type Hex, isAddressEqual, keccak256, toHex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createMakeName } from '../../../fixtures/makeName.js'
import {
  authorizeTransactionsWhile,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import type { Time } from '../../../fixtures/time.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
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

/**
 * WEB-1506 — the HCA registration permit must fund the batch actually sent
 * (Immunefi #89462, #93021).
 *
 * The commit leg carries the only funding permit, sized from two orchestrator
 * quotes. `/intents/route` prices purely on `destinationGasUnits` and never
 * reads the calls, so whatever gas limit the app sends IS the register leg's
 * budget. Before the fix that limit was a flat 450k, while a first
 * registration's reveal batch also carries `VerifiableFactory.deployProxy` for
 * the HCA's resolver (~186k gas) — unfunded, so the reveal could not pay and
 * the paid-for commitment expired. Separately, a failed quote was swallowed and
 * checkout went ahead on the rent alone.
 *
 * The fix adds the deploy to the register leg's limit whenever the resolver has
 * no code, read once for both the batch and the limit, and blocks checkout
 * (keeping the "up to" hedge) when the quote fails.
 *
 * What these reach that the unit tests don't: the real reveal batch the app
 * hands the orchestrator, the real chain read that decides whether the deploy
 * is in it, the deploy's gas measured on the fork, and the rendered picker
 * against a real failing orchestrator response.
 *
 * What they cannot reach: the local mockestrator quotes every intent at zero
 * fee and tops the account up before each fill, so an underfunded permit never
 * fails here. The oracle is therefore the gas limit on the wire — the one
 * number the real orchestrator prices the leg from.
 */
test.describe('HCA registration budget (WEB-1506)', () => {
  /** `IETHRegistrar.register(...)` — marks the register (reveal) leg. */
  const REGISTER_SELECTOR = '0xcff3e7c2'
  /** `VerifiableFactory.deployProxy(...)` — the conditional resolver deploy. */
  const DEPLOY_PROXY_SELECTOR = '0x5d84121a'
  /** `IETHRegistrar.commit(bytes32)` — marks the commit leg. */
  const COMMIT_SELECTOR = '0xf14fcbc8'
  /** Calls a resolver setter on — the PermissionedResolver itself. */
  const RESOLVER_SETTER_SELECTOR = '0xb4436dde'
  /** Intrinsic cost of a standalone tx — not paid again by a call in a batch. */
  const TX_INTRINSIC_GAS = 21_000n
  const QUOTE_FAILED_MESSAGE =
    "We couldn't work out the full cost of this registration right now, so we can't start it safely. Please try again in a moment."

  interface RouteRequest {
    account: { address: Address }
    destinationExecutions: { to: Address; data: Hex }[]
    destinationGasUnits: string
  }

  const parseRoute = (req: Request): RouteRequest | null => {
    if (!req.url().endsWith('/orchestrator/intents/route')) return null
    try {
      return JSON.parse(req.postData() ?? '') as RouteRequest
    } catch {
      return null
    }
  }

  const findCall = (route: RouteRequest, selector: string) =>
    route.destinationExecutions.find((e) => e.data.startsWith(selector))

  /**
   * The batch with the deploy taken out, as `to:selector` pairs — so a quote
   * with the deploy and one without can be compared like for like (the
   * primary-name toggle changes the batch too).
   */
  const shapeWithoutDeploy = (route: RouteRequest) =>
    route.destinationExecutions
      .filter((e) => !e.data.startsWith(DEPLOY_PROXY_SELECTOR))
      .map((e) => `${e.to.toLowerCase()}:${e.data.slice(0, 10)}`)
      .join(',')

  /** Every register-leg quote the page sends from now on. */
  const captureRegisterQuotes = (page: Page) => {
    const quotes: RouteRequest[] = []
    page.on('request', (req) => {
      const route = parseRoute(req)
      if (route && findCall(route, REGISTER_SELECTOR)) quotes.push(route)
    })
    return quotes
  }

  /**
   * Open the token picker for `label`, which mounts the budget quote. A full
   * navigation each time, so every call starts from an empty query cache.
   * Direct to the register page: a search typed before hydration is wiped.
   */
  async function openTokenPicker(page: Page, label: string) {
    await page.goto(`/register/${label}`)
    await page.getByRole('button', { name: /pay with stablecoins/i }).click()
    await clickThroughEnableSessions(page)
    await page.getByText('USDC', { exact: true }).click()
    return page.getByRole('dialog')
  }

  /** `setNameWithHCA(...)` on the reverse-registrar adapter: the primary name. */
  const SET_PRIMARY_NAME_SELECTOR = '0xab863445'
  /** Must match `HCA_BUDGET_STALE_TIME_MS` in `hcaBudget.query.ts`. */
  const BUDGET_STALE_TIME_MS = 60_000

  const setsPrimaryName = (route: RouteRequest) =>
    Boolean(findCall(route, SET_PRIMARY_NAME_SELECTOR))

  /** Register-leg quotes sent after index `from` for the given opt-in. */
  const quotesAfter = async (
    quotes: RouteRequest[],
    from: number,
    primaryName: boolean,
  ) => {
    const matching = () =>
      quotes.slice(from).filter((q) => setsPrimaryName(q) === primaryName)
    await expect
      .poll(() => matching().length, { timeout: 30_000 })
      .toBeGreaterThan(0)
    return matching()
  }

  /**
   * Wait until no new quote has been sent for 3s. A phase can send more than
   * one (on mount, then again after the toggle), and a late one must not be
   * counted against the next phase's chain state.
   */
  async function quotesSettled(page: Page, quotes: RouteRequest[]) {
    for (let last = -1; last !== quotes.length; ) {
      last = quotes.length
      await page.waitForTimeout(3_000)
    }
  }

  /** Open the picker with the primary-name opt-in set as asked. */
  async function openPickerFor(
    page: Page,
    label: string,
    primaryName: boolean,
  ) {
    const picker = await openTokenPicker(page, label)
    const toggle = picker.getByRole('switch', { name: /as your primary name/i })
    if ((await toggle.isChecked()) !== primaryName) await toggle.click()
    await expect(toggle).toBeChecked({ checked: primaryName })
    return picker
  }

  /**
   * Fail only the registration's own quotes, so the session-enable intent in
   * front of the picker still goes through.
   */
  const failRegistrationQuotes = async (route: Route) => {
    const body = parseRoute(route.request())
    if (
      body &&
      (findCall(body, REGISTER_SELECTOR) || findCall(body, COMMIT_SELECTOR))
    )
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'orchestrator unavailable' }),
      })
    return route.fallback()
  }

  // Both opt-ins: the primary-name call changes the batch and its own gas, so
  // the deploy must be funded on top of either shape.
  for (const primaryName of [true, false]) {
    test(`funds the resolver deploy in the register leg of a first registration (primary name ${primaryName ? 'on' : 'off'})`, async ({
      connectedPage: page,
    }) => {
      const label = `budget-${Date.now().toString(36)}`
      const quotes = captureRegisterQuotes(page)

      await openPickerFor(page, label, primaryName)
      const [sample] = await quotesAfter(quotes, 0, primaryName)
      await quotesSettled(page, quotes)
      // The resolver is the setters' target in every register batch.
      const resolver = findCall(
        sample as RouteRequest,
        RESOLVER_SETTER_SELECTOR,
      )?.to as Address
      expect(resolver, 'register batch sets records on a resolver').toBeTruthy()

      const originalCode =
        (await publicClient.getCode({ address: resolver })) ?? '0x'
      let firstRegistration: RouteRequest[]
      let existingResolver: RouteRequest[]
      try {
        // A first registration: the HCA's resolver has no code yet.
        await testClient.setCode({ address: resolver, bytecode: '0x' })
        let seen = quotes.length
        await openPickerFor(page, label, primaryName)
        await quotesAfter(quotes, seen, primaryName)
        await quotesSettled(page, quotes)
        firstRegistration = await quotesAfter(quotes, seen, primaryName)

        // A later registration: the resolver exists. Any code reads as deployed.
        await testClient.setCode({
          address: resolver,
          bytecode: originalCode !== '0x' ? originalCode : '0xfe',
        })
        seen = quotes.length
        await openPickerFor(page, label, primaryName)
        await quotesAfter(quotes, seen, primaryName)
        await quotesSettled(page, quotes)
        existingResolver = await quotesAfter(quotes, seen, primaryName)
      } finally {
        await testClient.setCode({ address: resolver, bytecode: originalCode })
      }

      // Guard (unchanged by the PR): the batch tracks the chain, so the deploy is
      // in it exactly when the resolver has no code.
      for (const q of firstRegistration)
        expect(
          findCall(q, DEPLOY_PROXY_SELECTOR),
          'deploy on a first registration',
        ).toBeTruthy()
      for (const q of existingResolver)
        expect(
          findCall(q, DEPLOY_PROXY_SELECTOR),
          'no deploy once the resolver exists',
        ).toBeUndefined()

      // What the deploy costs on chain, from a never-deployed sender — the same
      // measurement the fix's constant is derived from.
      const deploy = findCall(
        firstRegistration[0] as RouteRequest,
        DEPLOY_PROXY_SELECTOR,
      ) as RouteRequest['destinationExecutions'][number]
      const deployGas =
        (await publicClient.estimateGas({
          account: privateKeyToAccount(generatePrivateKey()).address,
          to: deploy.to,
          data: deploy.data,
        })) - TX_INTRINSIC_GAS

      // The bug: the same batch shape, with and without the deploy, was quoted
      // at the same gas limit, so nothing paid for the deploy.
      const pairs = firstRegistration.flatMap((withDeploy) => {
        const match = existingResolver.find(
          (q) => shapeWithoutDeploy(q) === shapeWithoutDeploy(withDeploy),
        )
        return match ? [{ withDeploy, withoutDeploy: match }] : []
      })
      expect(pairs.length, 'a like-for-like quote pair').toBeGreaterThan(0)
      for (const { withDeploy, withoutDeploy } of pairs) {
        const funded =
          BigInt(withDeploy.destinationGasUnits) -
          BigInt(withoutDeploy.destinationGasUnits)
        test.info().annotations.push({
          type: 'register-leg gas',
          description: `${withoutDeploy.destinationGasUnits} → ${withDeploy.destinationGasUnits} with deploy (+${funded}); deploy measured at ${deployGas}`,
        })
        expect(
          funded,
          `gas funded for the deploy (${funded}) covers its on-chain cost (${deployGas})`,
        ).toBeGreaterThanOrEqual(deployGas)
      }
    })
  }

  test('blocks checkout and keeps the "up to" hedge when the budget quote fails', {
    tag: ['@smoke'],
  }, async ({ connectedPage: page }) => {
    const label = `budget-fail-${Date.now().toString(36)}`

    await page.route('**/orchestrator/intents/route', failRegistrationQuotes)

    const picker = await openTokenPicker(page, label)
    const registerButton = picker.getByRole('button', {
      name: /register name/i,
    })

    // The bug: checkout went ahead on the rent alone, unhedged.
    await expect(picker.getByText(QUOTE_FAILED_MESSAGE)).toBeVisible({
      timeout: 30_000,
    })
    await expect(registerButton).toBeDisabled()
    await expect(picker.getByText('up to', { exact: true })).toBeVisible()

    // Positive control: with the orchestrator answering, the same name checks
    // out — the gate is the failed quote, not the name or the wallet.
    await page.unroute('**/orchestrator/intents/route', failRegistrationQuotes)
    const healthy = await openTokenPicker(page, label)
    await expect(
      healthy.getByRole('button', { name: /register name/i }),
    ).toBeEnabled({ timeout: 30_000 })
    await expect(healthy.getByText(QUOTE_FAILED_MESSAGE)).toHaveCount(0)
  })

  test('a quote that fails at the click does not start the registration', async ({
    connectedPage: page,
  }) => {
    // The render path blocks on a quote that has ALREADY failed. This is the
    // other route in: the screen painted a healthy quote, the quote went stale,
    // and the re-quote on the click fails. Before the fix `.catch(() => null)`
    // fell through and started the registration on the rent alone.
    const label = `budget-click-${Date.now().toString(36)}`
    const picker = await openTokenPicker(page, label)
    const registerButton = picker.getByRole('button', {
      name: /register name/i,
    })
    await expect(registerButton).toBeEnabled({ timeout: 30_000 })

    // Let the healthy quote go stale, so the click re-quotes instead of
    // reusing it. Nothing refetches it in between: no focus change, no remount.
    await page.waitForTimeout(BUDGET_STALE_TIME_MS + 5_000)
    await expect(registerButton).toBeEnabled()
    await expect(picker.getByText(QUOTE_FAILED_MESSAGE)).toHaveCount(0)

    await page.route('**/orchestrator/intents/route', failRegistrationQuotes)
    await registerButton.click()

    // Either outcome is a sign the click was handled: the refusal (fixed) or
    // the started flow failing on its own re-quote (before the fix).
    const flowFailed = page.getByText('Registration Failed')
    await expect(
      picker.getByText(QUOTE_FAILED_MESSAGE).or(flowFailed),
    ).toBeVisible({ timeout: 60_000 })

    // The bug: the click started the registration on the rent alone.
    await expect(flowFailed, 'the registration flow started').toHaveCount(0)
    expect(await readStoredRegistration(page)).toBeNull()
    await expect(
      page.getByRole('button', { name: 'Set up later' }),
    ).toHaveCount(0)
    await expect(picker.getByText(QUOTE_FAILED_MESSAGE)).toBeVisible()
  })
})
