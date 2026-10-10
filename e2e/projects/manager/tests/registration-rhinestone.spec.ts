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
import {
  injectHeadlessWeb3Provider,
  type Web3ProviderBackend,
} from '@ensdomains/headless-web3-provider'
import { expect, type Page, type Request, type Route } from '@playwright/test'
import {
  type Address,
  encodeAbiParameters,
  formatUnits,
  type Hex,
  isAddressEqual,
  keccak256,
  pad,
  parseAbi,
  toHex,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createMakeName } from '../../../fixtures/makeName.js'
import {
  authorizeTransactionsWhile,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import type { Time } from '../../../fixtures/time.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import { expectFlowSuccess } from '../../../helpers/flow-completion.js'
import {
  clickThroughEnableSessions,
  connectWithHeadlessWallet,
  dismissBackendAuthModal,
  PERMITTED_SIGN_KINDS,
} from '../../../helpers/manager-auth.js'
import {
  assertV2Registered,
  V2Status,
} from '../../../helpers/migration-assertions.js'
import { createIndexerMock } from '../../../helpers/mock-indexer.js'
import type { PortalAccounts } from '../../../helpers/portal-auth.js'
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
    await page.getByRole('button', { name: 'Select USDC' }).click()

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

/**
 * WEB-1702 (#1314) — one registration per wallet, across tabs.
 *
 * #1254 locks the wallet while a tab registers: a claim in localStorage
 * (`ens-registration-locks-v1`) keyed by the tab's holder id, kept in
 * sessionStorage. Two bugs QA found in it:
 *
 * 1. Chrome's "Duplicate tab" clones sessionStorage, holder id included. The
 *    clone's registration flow swept "this tab's" claims on mount, which were
 *    the original's, so the lock was freed while the original was still
 *    registering. A clone opened mid-registration lands on the same URL, finds
 *    the resume record, and once connected resumed the same registration as
 *    its own attempt — two tabs driving one registration on one permit nonce.
 * 2. A tab refused by the lock showed "Registration Failed" and "Retrying will
 *    attempt the registration again from where it left off", when nothing had
 *    started and the fix is in the other tab.
 *
 * The fix: on mount a tab broadcasts the id it holds, a live tab already
 * answering to it says so, and the clone takes a fresh id before any sweep
 * runs. The refusal raises its own event and the screen reads "Another
 * Registration Is Running", leading with Back to Quote.
 *
 * What these reach that the unit tests don't: two real browser tabs sharing
 * localStorage, a real `BroadcastChannel`, the real mount sweep in the
 * provider, the real heartbeat of a registration in flight, the resume path a
 * duplicated tab actually takes, and the rendered refusal. The unit tests stub
 * the channel and the machine's child.
 *
 * Playwright can't press "Duplicate tab", so `openDuplicateTab` opens a second
 * page in the same context (shared localStorage) and copies the original's
 * sessionStorage into it before the app loads, which is what the browser does.
 */
const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const LOCKS_KEY = 'ens-registration-locks-v1'
const HOLDER_KEY = 'ens-registration-holder'
/** `CLAIM_REPLY_WINDOW_MS` is 250ms; give the clone's sweep room to have run. */
const SWEEP_SETTLE_MS = 1_000
const BUSY_TITLE = 'Another Registration Is Running'
const BUSY_NEXT_STEP =
  'Finish or cancel the other registration in its tab, then Try Again once this wallet is free.'
const RETRY_COPY =
  'Retrying will attempt the registration again from where it left off.'

type StoredClaim = { name: string; holderId: string; updatedAt: number }

const readHolderId = (page: Page) =>
  page.evaluate((key) => window.sessionStorage.getItem(key), HOLDER_KEY)

const readClaim = (page: Page, owner: Address) =>
  page.evaluate(
    ({ key, owner }) => {
      const raw = window.localStorage.getItem(key)
      const locks = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      return (locks[owner.toLowerCase()] ?? null) as StoredClaim | null
    },
    { key: LOCKS_KEY, owner },
  )

/** A second tab on the same wallet, sharing the first tab's localStorage. */
async function openSecondTab(
  original: Page,
  accounts: PortalAccounts,
  options: { duplicate: boolean },
) {
  const page = await original.context().newPage()
  await createIndexerMock().installIfEnabled(page)
  const wallet = await injectHeadlessWeb3Provider({
    page,
    privateKeys: accounts.getAllPrivateKeys(),
    chains: [
      {
        ...sepolia,
        rpcUrls: {
          default: {
            http: [process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'],
          },
        },
      },
    ],
    permitted: [...PERMITTED_SIGN_KINDS],
  })

  if (options.duplicate) {
    const inherited = await original.evaluate(() =>
      Object.entries(window.sessionStorage),
    )
    // Only before the first load: whatever the clone settles on afterwards
    // (a fresh id) must survive its own reloads, as it would in the browser.
    await page.addInitScript((entries) => {
      if (window.sessionStorage.length > 0) return
      for (const [key, value] of entries) {
        window.sessionStorage.setItem(key, value)
      }
    }, inherited)
  }

  return { page, wallet }
}

/**
 * Connect the second tab. The first tab already skipped SIWE, and that choice
 * is in the shared localStorage, so the modal normally doesn't come back;
 * waiting out its full 60s window for nothing would dominate the test.
 */
async function connectSecondTab(page: Page, wallet: Web3ProviderBackend) {
  await connectWithHeadlessWallet(page, wallet)
  await dismissBackendAuthModal(page, { timeout: 5_000 })
}

/**
 * Hold a live claim for `name` in `page`'s tab, refreshed the way the
 * registering screen's heartbeat does it: only while the claim is still this
 * tab's, so a claim another tab sweeps away stays gone. Returns a release that
 * does what the flow does when that registration ends.
 */
async function holdClaim(page: Page, owner: Address, name: string) {
  await page.evaluate(
    ({ key, holderKey, owner, name }) => {
      const holderId = window.sessionStorage.getItem(holderKey)
      if (!holderId) throw new Error('the tab has no holder id yet')
      const ownerKey = owner.toLowerCase()
      const read = () =>
        JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<
          string,
          { name: string; holderId: string; updatedAt: number }
        >
      const write = (updatedAt: number) =>
        window.localStorage.setItem(
          key,
          JSON.stringify({
            ...read(),
            [ownerKey]: { name, holderId, updatedAt },
          }),
        )

      write(Date.now())
      const heartbeat = window.setInterval(() => {
        const claim = read()[ownerKey]
        if (claim?.holderId === holderId && claim.name === name) {
          write(Date.now())
        }
      }, 5_000)
      ;(window as Window & { __releaseClaim?: () => void }).__releaseClaim =
        () => {
          window.clearInterval(heartbeat)
          const { [ownerKey]: _released, ...rest } = read()
          window.localStorage.setItem(key, JSON.stringify(rest))
        }
    },
    { key: LOCKS_KEY, holderKey: HOLDER_KEY, owner, name },
  )

  return () =>
    page.evaluate(() =>
      (window as Window & { __releaseClaim?: () => void }).__releaseClaim?.(),
    )
}

/**
 * Open the quote for `label` in a connected tab and wait for the flow to have
 * mounted. The label is server-rendered; the pay button needs the wallet, so
 * it only shows once the client has hydrated and the mount sweep has run.
 */
async function openRegisterPage(page: Page, label: string) {
  await page.goto(`${MANAGER_APP_URL}/register/${label}`)
  await waitForQuote(page)
}

async function waitForQuote(page: Page) {
  await expect(
    page.getByRole('button', { name: /pay with stablecoins/i }),
  ).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => readHolderId(page)).toBeTruthy()
}

/** Open the quote for `label` in a second tab and connect it there. */
async function openRegisterPageAndConnect(
  page: Page,
  wallet: Web3ProviderBackend,
  label: string,
) {
  await page.goto(`${MANAGER_APP_URL}/register/${label}`)
  await connectSecondTab(page, wallet)
  await waitForQuote(page)
  await page.waitForTimeout(SWEEP_SETTLE_MS)
}

/** Pay with stablecoins → USDC → Register name, on an already open quote. */
async function pressRegister(page: Page) {
  await page.getByRole('button', { name: /pay with stablecoins/i }).click()
  await clickThroughEnableSessions(page)
  await page.getByText('USDC', { exact: true }).click()
  await page.getByRole('button', { name: /register name/i }).click()
}

/** The refusal screen, naming the registration that holds the wallet. */
async function expectWalletBusyScreen(page: Page, blockingName: string) {
  const main = page.locator('main')
  await expect(main.getByText(BUSY_TITLE, { exact: true })).toBeVisible({
    timeout: 20_000,
  })
  await expect(
    main.getByText(
      `${blockingName} is already being registered with this wallet, possibly in another tab. One registration runs at a time, so this one has not started.`,
    ),
  ).toBeVisible()
  await expect(main.getByText(BUSY_NEXT_STEP)).toBeVisible()
  // Positive sign the action row rendered before asserting what's absent.
  await expect(
    main.getByRole('button', { name: 'Back to Quote' }),
  ).toBeVisible()
  await expect(main.getByRole('button', { name: 'Try Again' })).toBeVisible()
  await expect(
    main.getByText('Registration Failed', { exact: true }),
  ).toHaveCount(0)
  await expect(main.getByText(RETRY_COPY)).toHaveCount(0)
}

test.describe('one registration per wallet across tabs (WEB-1702)', () => {
  /**
   * The exact report: duplicate a tab in the middle of a real registration.
   * The clone lands on the same URL, disconnected first and then connected.
   */
  test('a tab duplicated mid-registration leaves the original’s claim in place and does not resume it alongside', async ({
    connectedPage: page,
    accounts,
    wallet,
  }) => {
    test.setTimeout(420_000)
    const owner = accounts.getAddress('user')
    const label = `rh-dup-${Date.now().toString(36)}`
    const name = `${label}.eth`

    await registerUntilCommitConfirmed(page, label)
    const originalId = await readHolderId(page)
    expect(originalId).toBeTruthy()
    expect(await readClaim(page, owner)).toMatchObject({
      name,
      holderId: originalId,
    })

    const { page: clone, wallet: cloneWallet } = await openSecondTab(
      page,
      accounts,
      { duplicate: true },
    )
    await clone.goto(page.url())
    expect(await readHolderId(clone)).toBeTruthy()

    // Disconnected, the clone offers to resume the unfinished registration.
    const cloneMain = clone.locator('main')
    await expect(cloneMain.getByText('Unfinished registration')).toBeVisible({
      timeout: 20_000,
    })
    await clone.waitForTimeout(SWEEP_SETTLE_MS)

    // The bug: the clone's mount sweep freed the original's live claim.
    expect(await readClaim(clone, owner)).toMatchObject({
      name,
      holderId: originalId,
    })
    // …because the clone answers to its own id now, not the inherited one.
    const cloneId = await readHolderId(clone)
    expect(cloneId).toBeTruthy()
    expect(cloneId).not.toBe(originalId)

    // Connected, the clone tries to resume and is refused: it says so rather
    // than running the original's registration a second time.
    await connectSecondTab(clone, cloneWallet)
    await expectWalletBusyScreen(clone, name)
    expect(await readClaim(clone, owner)).toMatchObject({
      name,
      holderId: originalId,
    })

    // The original is undisturbed and finishes on chain.
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
      timeout: 240_000,
    })
    registrationComplete = true
    await authorizeSetupTxs
    await assertV2Registered(label)
    const registered = await readRegistryState(label)
    expect(isAddressEqual(registered.latestOwner, owner)).toBe(true)
    // Finishing releases the wallet.
    expect(await readClaim(page, owner)).toBeNull()

    // The clone's Try Again now re-raises the resume it queued, for a name
    // that is already registered. Whatever it shows (finding F1 in the test
    // plan), it must not pay or submit anything: no permit, no commit, no
    // reveal, and the name stays where the original put it.
    const permitLines: string[] = []
    clone.on('console', (message) => {
      if (message.text().includes('Funding permit signing')) {
        permitLines.push(message.text())
      }
    })
    const cloneMonitor = createConsoleMonitor(clone, {
      logConsoleMessages: false,
    })
    await cloneMain.getByRole('button', { name: 'Try Again' }).click()
    await expect(cloneMain.getByText(BUSY_TITLE, { exact: true })).toHaveCount(
      0,
    )
    await cloneMain
      .getByText(FAILURE_SCREEN_TEXT)
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => {})
    await clone.waitForTimeout(5_000)
    expect(permitLines).toEqual([])
    expect(
      cloneMonitor
        .getTransactionLines()
        .filter((l) => l.txId === COMMIT_TX_ID || l.txId === REVEAL_TX_ID),
    ).toEqual([])
    const after = await readRegistryState(label)
    expect(isAddressEqual(after.latestOwner, owner)).toBe(true)
  })

  /**
   * The same bug without a chain: the original holds a live claim for one
   * name, and its clone opens the quote for another. Cheap enough to gate
   * every push, and it covers both halves of the fix.
   */
  test('a duplicated tab does not free the original’s claim, and is told to wait for it', {
    tag: ['@smoke'],
  }, async ({ connectedPage: page, accounts }) => {
    const owner = accounts.getAddress('user')
    const stamp = Date.now().toString(36)
    const heldLabel = `rh-held-${stamp}`
    const cloneLabel = `rh-clone-${stamp}`

    await openRegisterPage(page, heldLabel)
    const originalId = await readHolderId(page)
    expect(originalId).toBeTruthy()
    const release = await holdClaim(page, owner, `${heldLabel}.eth`)

    const { page: clone, wallet: cloneWallet } = await openSecondTab(
      page,
      accounts,
      { duplicate: true },
    )
    await openRegisterPageAndConnect(clone, cloneWallet, cloneLabel)

    // The bug: the clone's mount sweep took the original's claim with it.
    expect(await readClaim(clone, owner)).toMatchObject({
      name: `${heldLabel}.eth`,
      holderId: originalId,
    })
    const cloneId = await readHolderId(clone)
    expect(cloneId).not.toBe(originalId)

    await pressRegister(clone)
    await expectWalletBusyScreen(clone, `${heldLabel}.eth`)
    expect(await readClaim(clone, owner)).toMatchObject({
      holderId: originalId,
    })

    // Positive control: once the original lets go, Try Again starts this
    // registration, under the clone's own id.
    await release()
    await clone
      .locator('main')
      .getByRole('button', { name: 'Try Again' })
      .click()
    await expect(
      clone.locator('main').getByText(BUSY_TITLE, { exact: true }),
    ).toHaveCount(0)
    await expect
      .poll(() => readClaim(clone, owner), { timeout: 15_000 })
      .toMatchObject({ name: `${cloneLabel}.eth`, holderId: cloneId })
  })

  /**
   * The second half of the report on its own: an ordinary second tab (its
   * own id, no cloning) refused by the lock. Before the fix this read as a
   * failed registration with a retry pitch.
   */
  test('a second tab refused by the lock says another registration is running, not that this one failed', async ({
    connectedPage: page,
    accounts,
  }) => {
    const owner = accounts.getAddress('user')
    const stamp = Date.now().toString(36)
    const heldLabel = `rh-held-${stamp}`
    const otherLabel = `rh-other-${stamp}`

    await openRegisterPage(page, heldLabel)
    const originalId = await readHolderId(page)
    await holdClaim(page, owner, `${heldLabel}.eth`)

    const { page: other, wallet: otherWallet } = await openSecondTab(
      page,
      accounts,
      { duplicate: false },
    )
    await openRegisterPageAndConnect(other, otherWallet, otherLabel)
    await pressRegister(other)

    await expectWalletBusyScreen(other, `${heldLabel}.eth`)
    expect(await readClaim(other, owner)).toMatchObject({
      holderId: originalId,
    })

    // Back to Quote clears the notice and leaves the other tab's claim alone.
    const main = other.locator('main')
    await main.getByRole('button', { name: 'Back to Quote' }).click()
    await expect(
      other.getByRole('button', { name: /pay with stablecoins/i }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(main.getByText(BUSY_TITLE, { exact: true })).toHaveCount(0)
    expect(await readClaim(other, owner)).toMatchObject({
      holderId: originalId,
    })
  })

  /**
   * Guard (green before the fix too): the sweep still does its job. A reload
   * of the original, with its clone open, keeps its id (the clone no longer
   * answers to it) and frees the claim its interrupted run left behind.
   */
  test('reloading the original with its clone open still frees the original’s leftover claim', async ({
    connectedPage: page,
    accounts,
  }) => {
    const owner = accounts.getAddress('user')
    const label = `rh-reload-${Date.now().toString(36)}`

    await openRegisterPage(page, label)
    const originalId = await readHolderId(page)
    await holdClaim(page, owner, `${label}.eth`)

    const { page: clone, wallet: cloneWallet } = await openSecondTab(
      page,
      accounts,
      { duplicate: true },
    )
    await openRegisterPageAndConnect(clone, cloneWallet, label)

    await page.reload()
    await waitForQuote(page)
    await expect
      .poll(() => readClaim(page, owner), { timeout: 10_000 })
      .toBeNull()
    expect(await readHolderId(page)).toBe(originalId)
  })
})

/**
 * WEB-1483 (PR #1303): the payment sheet when an earlier attempt left USDC in
 * the HCA.
 *
 * The bug: an attempt that funded the HCA but never finished leaves USDC behind,
 * and the next attempt's sheet set it against the cost without naming either
 * figure. The headline still read "Total" while showing the full cost, the token
 * row's balance was labelled "available", and the two messages that did explain
 * the subtraction called the HCA "your account", a word support has ruled out.
 *
 * The fix itemises the cost as "Registration fee" and "Network fee". When there
 * is one, it adds a muted "Left from your last attempt -$x" deduction and
 * relabels the headline "You pay now". It says "in your wallet" on the token
 * row and rewords both messages. Flipping the primary-name toggle now carries
 * the last quote through (`placeholderData`) and holds checkout until the new
 * one lands.
 *
 * The PR's unit tests cover the rounding helper and the component with
 * hand-made numbers. These run the real quote against a real HCA balance on
 * the fork: the leftover is seeded with `setStorageAt` on the USDC balance slot
 * and read back as the oracle, and the lines on screen must subtract to the
 * headline to the cent. The HCA is counterfactual (undeployed) here, which the
 * app's balance read does not care about. The manager suite runs with
 * `workers: 1`, so nothing else sees the seeded balance, and every test puts
 * the original back in a `finally`.
 */
test.describe('payment sheet with a leftover from the last attempt (WEB-1483)', () => {
  const USDC = ensL1Contracts[supportedL1Chains.sepolia].usdc.address as Address
  const USDC_DECIMALS = 6
  /** OZ ERC20: the balances mapping is slot 0. */
  const balanceSlot = (holder: Address) =>
    keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }],
        [holder, 0n],
      ),
    )
  const usdcAbi = parseAbi([
    'function balanceOf(address) view returns (uint256)',
  ])

  const readUsdc = (holder: Address) =>
    publicClient.readContract({
      address: USDC,
      abi: usdcAbi,
      functionName: 'balanceOf',
      args: [holder],
    })

  const setUsdc = (holder: Address, raw: bigint) =>
    testClient.setStorageAt({
      address: USDC,
      index: balanceSlot(holder),
      value: pad(toHex(raw)),
    })

  /** `$1,234.56` → 1234.56. Parsed from the DOM, compared in whole cents. */
  const toCents = (text: string) =>
    Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100)

  /** USDC base units → whole cents, rounded as the sheet rounds. */
  const rawToCents = (raw: bigint) =>
    Math.round(Number(formatUnits(raw, USDC_DECIMALS)) * 100)

  const LEFTOVER_LABEL = 'Left from your last attempt'
  const FEE_LABEL = /^Network (fee|cost)$/

  /**
   * The HCA the picker quotes for, from the account on its `/intents/route`
   * requests. Session-enable is the first of them, so it is known once the
   * picker has opened at least once.
   */
  const captureHca = (page: Page) => {
    const seen: { hca?: Address } = {}
    page.on('request', (req) => {
      if (!req.url().endsWith('/orchestrator/intents/route')) return
      try {
        seen.hca = JSON.parse(req.postData() ?? '').account.address
      } catch {}
    })
    return seen
  }

  /**
   * Open the token picker on USDC and wait for a settled quote. A full
   * navigation each time, so the budget query (and the HCA balance read inside
   * it) starts from an empty cache.
   */
  async function openPicker(
    page: Page,
    label: string,
    { selectUsdc = true }: { selectUsdc?: boolean } = {},
  ) {
    await page.goto(`/register/${label}`)
    await page.getByRole('button', { name: /pay with stablecoins/i }).click()
    await clickThroughEnableSessions(page)
    // USDC is the only option, so it is selected for us; a click is only the
    // user's own path, and a wallet short of the debit cannot make it (the row
    // is disabled).
    if (selectUsdc) await page.getByText('USDC', { exact: true }).click()
    const picker = page.getByRole('dialog')
    // Positive sign the quote landed: the fee line shows a figure, not the
    // pending em dash. Either label, so the pre-fix build ("Network cost")
    // gets as far as the assertions that encode the bug.
    await expect(rowAmount(picker, FEE_LABEL)).toHaveText(/^\$[\d,]+\.\d\d$/, {
      timeout: 30_000,
    })
    return picker
  }

  /** The figure on a breakdown line, found by the line's label. */
  const rowAmount = (
    picker: ReturnType<Page['getByRole']>,
    label: string | RegExp,
  ) =>
    picker
      .getByText(label, { exact: true })
      .locator('xpath=..')
      .locator('.tabular-nums')

  /** The headline: its label, and its figure. */
  const headline = (picker: ReturnType<Page['getByRole']>) => ({
    label: picker.getByText(/^(Total|You pay now)$/),
    amount: picker
      .getByText('USD', { exact: true })
      .locator('xpath=..')
      .locator('.tabular-nums'),
  })

  /** Open once so the HCA is known, then run `body` with its USDC put back after. */
  async function withSeededHca(
    page: Page,
    label: string,
    body: (hca: Address) => Promise<void>,
  ) {
    const seen = captureHca(page)
    await openPicker(page, label)
    expect(seen.hca, 'picker quoted for an HCA').toBeTruthy()
    const hca = seen.hca as Address
    const original = await readUsdc(hca)
    try {
      await body(hca)
    } finally {
      await setUsdc(hca, original)
    }
  }

  test('names what the last attempt left and makes the headline what the wallet pays now', {
    tag: ['@smoke'],
  }, async ({ connectedPage: page, accounts }) => {
    const label = `leftover-${Date.now().toString(36)}`
    const wallet = accounts.getAddress('user')

    await withSeededHca(page, label, async (hca) => {
      // Guard (the common case, unchanged in shape): an empty HCA leaves
      // nothing to deduct, so the headline is the plain total.
      await setUsdc(hca, 0n)
      let picker = await openPicker(page, label)
      await expect(headline(picker).label).toHaveText('Total')
      const total = toCents(await headline(picker).amount.innerText())
      const fee = toCents(await rowAmount(picker, FEE_LABEL).innerText())
      expect(total, 'the name has a price').toBeGreaterThan(fee)
      await expect(
        picker.getByText(LEFTOVER_LABEL, { exact: true }),
      ).toHaveCount(0)

      // The report: an earlier attempt left $1.82 in the HCA.
      const leftoverRaw = 1_820_000n
      await setUsdc(hca, leftoverRaw)
      picker = await openPicker(page, label)

      // The bug: the deduction had no line of its own, and the headline still
      // said "Total" over a figure that was no longer the total.
      const leftover = rowAmount(picker, LEFTOVER_LABEL)
      await expect(leftover).toHaveText(/^-\$/)
      // Oracle: the deduction is the HCA's balance on chain.
      expect(toCents(await leftover.innerText())).toBe(
        rawToCents(await readUsdc(hca)),
      )
      await expect(headline(picker).label).toHaveText('You pay now')
      // The lines on screen subtract to the headline, to the cent.
      const registration = toCents(
        await rowAmount(picker, 'Registration fee').innerText(),
      )
      expect(registration + fee).toBe(total)
      expect(toCents(await headline(picker).amount.innerText())).toBe(
        registration + fee - rawToCents(leftoverRaw),
      )
      await expect(
        picker.getByRole('button', {
          name: 'Why is there money left from your last attempt?',
        }),
      ).toBeVisible()
      await expect(picker.getByText(/\baccount\b/i)).toHaveCount(0)
      await expect(
        picker.getByRole('button', { name: /register name/i }),
      ).toBeEnabled()

      // The token row's balance is the wallet's, and says so, so it can't be
      // read as the leftover. Oracle: the wallet's USDC on chain.
      const tokenRow = picker
        .getByText('in your wallet', { exact: true })
        .locator('xpath=..')
      await expect(tokenRow).toBeVisible()
      expect(toCents(await tokenRow.locator('p').first().innerText())).toBe(
        rawToCents(await readUsdc(wallet)),
      )
      await expect(picker.getByText('available', { exact: true })).toHaveCount(
        0,
      )
    })
  })

  test('a leftover that covers the whole registration says so, without calling it an account', async ({
    connectedPage: page,
  }) => {
    const label = `leftover-all-${Date.now().toString(36)}`

    await withSeededHca(page, label, async (hca) => {
      // More than any name costs: the wallet owes nothing.
      await setUsdc(hca, 1_000_000_000n)
      const picker = await openPicker(page, label)

      // The bug: this said "Your account already holds the … USDC".
      const covered = picker.getByText(
        /^What was left from your last attempt covers the [\d.]+ USDC this registration needs, so you won't be asked to approve a payment\.$/,
      )
      await expect(covered).toBeVisible()
      await expect(picker.getByText(/\baccount\b/i)).toHaveCount(0)

      // The figure it quotes is the two lines' total, and the HCA is credited
      // only that much, not its whole balance.
      const total =
        toCents(await rowAmount(picker, 'Registration fee').innerText()) +
        toCents(await rowAmount(picker, FEE_LABEL).innerText())
      const [, coveredUsdc] = (await covered.innerText()).match(
        /covers the ([\d.]+) USDC/,
      ) as RegExpMatchArray
      expect(toCents(coveredUsdc as string)).toBe(total)
      expect(toCents(await rowAmount(picker, LEFTOVER_LABEL).innerText())).toBe(
        total,
      )
      await expect(headline(picker).label).toHaveText('You pay now')
      expect(toCents(await headline(picker).amount.innerText())).toBe(0)
      // A debit of zero is a legitimate state, not a missing quote.
      await expect(
        picker.getByRole('button', { name: /register name/i }),
      ).toBeEnabled()
    })
  })

  test('a wallet short of the remainder is told what the leftover covers and what it still needs', async ({
    connectedPage: page,
    accounts,
  }) => {
    const label = `leftover-short-${Date.now().toString(36)}`
    const wallet = accounts.getAddress('user')
    const walletOriginal = await readUsdc(wallet)

    try {
      await withSeededHca(page, label, async (hca) => {
        const leftoverRaw = 1_820_000n
        const walletRaw = 5_000_000n
        await setUsdc(hca, leftoverRaw)
        await setUsdc(wallet, walletRaw)
        const picker = await openPicker(page, label, { selectUsdc: false })
        await expect(
          picker.getByRole('button', { name: 'Select USDC' }),
        ).toBeDisabled()

        // The bug: this said "…and your account already holds 1.82…".
        const shortfall = picker.getByText(
          /^Not enough USDC\. This registration costs ([\d.]+) USDC and ([\d.]+) is left from your last attempt, so you need ([\d.]+) more, but your wallet holds ([\d.]+) USDC\.$/,
        )
        await expect(shortfall).toBeVisible()

        // Every figure in it is checkable against the lines and the chain.
        const [, costs, left, need, holds] = (
          await shortfall.innerText()
        ).match(
          /costs ([\d.]+) USDC and ([\d.]+) is left.*need ([\d.]+) more.*holds ([\d.]+) USDC/,
        ) as RegExpMatchArray
        const total =
          toCents(await rowAmount(picker, 'Registration fee').innerText()) +
          toCents(await rowAmount(picker, FEE_LABEL).innerText())
        expect(toCents(costs as string)).toBe(total)
        expect(toCents(left as string)).toBe(rawToCents(leftoverRaw))
        expect(toCents(need as string)).toBe(total - rawToCents(leftoverRaw))
        expect(toCents(holds as string)).toBe(rawToCents(walletRaw))
        await expect(
          picker.getByRole('button', { name: /register name/i }),
        ).toBeDisabled()
        await expect(picker.getByText(/\baccount\b/i)).toHaveCount(0)

        // Positive control: a wallet that covers the remainder clears the gate,
        // so the block above was the shortfall, not the leftover.
        await setUsdc(wallet, walletOriginal)
        const funded = await openPicker(page, label)
        await expect(
          funded.getByRole('button', { name: /register name/i }),
        ).toBeEnabled()
        await expect(funded.getByText(/^Not enough USDC/)).toHaveCount(0)
      })
    } finally {
      await setUsdc(wallet, walletOriginal)
    }
  })

  test('flipping the primary-name toggle keeps the breakdown and holds Register until the new quote lands', async ({
    connectedPage: page,
  }) => {
    const label = `leftover-toggle-${Date.now().toString(36)}`
    /** `setNameWithHCA(...)`: in the register leg only when the toggle is on. */
    const SET_PRIMARY_NAME_SELECTOR = 'ab863445'
    const REGISTER_SELECTOR = 'cff3e7c2'

    // The opt-in defaults off once the wallet has a primary name, so read the
    // default first, on another label.
    const startsOn = await (await openPicker(page, `${label}-x`))
      .getByRole('switch', { name: /as your primary name/i })
      .isChecked()

    // With the opt-in on, opening the sheet quotes both states at once, so a
    // flip after they land would be served from cache. Hold the other state's
    // quote from the start, whether it goes out on open or on the flip: the
    // flip then lands on a quote still in flight, the state the fix's
    // `placeholderData` and `isQuoteStale` exist for.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let heldCount = 0
    const holdOffQuote = async (route: Route) => {
      const data = route.request().postData() ?? ''
      if (
        data.includes(REGISTER_SELECTOR) &&
        data.includes(SET_PRIMARY_NAME_SELECTOR) !== startsOn
      ) {
        heldCount++
        await held
      }
      return route.fallback()
    }
    await page.route('**/orchestrator/intents/route', holdOffQuote)

    try {
      const picker = await openPicker(page, label)
      const toggle = picker.getByRole('switch', {
        name: /as your primary name/i,
      })
      const registerButton = picker.getByRole('button', {
        name: /register name/i,
      })
      await expect(toggle).toBeChecked({ checked: startsOn })
      await expect(registerButton).toBeEnabled()
      const feeBefore = await rowAmount(picker, FEE_LABEL).innerText()

      await toggle.click()
      await expect(toggle).toBeChecked({ checked: !startsOn })
      await expect.poll(() => heldCount, { timeout: 15_000 }).toBeGreaterThan(0)

      // The bug: the fee line emptied out while the new quote loaded, and
      // Register stayed live on the rent alone.
      await expect(registerButton).toBeDisabled()
      await expect(rowAmount(picker, FEE_LABEL)).toHaveText(feeBefore)
      // Still disabled a beat later: the gate is the pending quote, not a
      // re-render in passing.
      await page.waitForTimeout(2_000)
      await expect(registerButton).toBeDisabled()

      // Positive control: once the quote for the new state lands, checkout opens.
      release()
      await expect(registerButton).toBeEnabled({ timeout: 30_000 })
    } finally {
      release()
      await page.unroute('**/orchestrator/intents/route', holdOffQuote)
    }
  })
})
