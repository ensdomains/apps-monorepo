/**
 * Gas-sponsorship JWT hop E2E (FET-3334).
 *
 * Proves the runtime path manager → api-worker → orchestrator end to end:
 * with `VITE_FF_EXPERIMENTAL_JWT=true` the Rhinestone SDK is built in
 * `mode: 'experimental_jwt'` and, per sponsored intent, calls
 * `getIntentExtensionToken` — which POSTs to the api-worker
 * `/sponsorship/extension-token` endpoint (reached through the manager `/api`
 * proxy). The worker runs the `shouldSponsor` predicate and signs a single-use
 * ES256 token; the SDK then submits the sponsored intent to the orchestrator.
 *
 * This spec drives the same proven Rhinestone registration journey as
 * `registration-rhinestone.spec.ts` and asserts that at least one
 * extension-token mint returned 200 during the sponsored buy — i.e. the SDK
 * really invoked our callback at runtime and the worker sponsored the intent.
 *
 * Prerequisites (registration-rhinestone.spec.ts) PLUS JWT mode:
 *   - E2E infra running: `pnpm e2e:infra:up`
 *   - api-worker running as the `/api` proxy target, with RHINESTONE_JWT_*
 *     signing config in `.dev.vars`.
 *   - Manager started with:
 *       VITE_FF_RHINESTONE_SESSIONS=true
 *       VITE_RHINESTONE_ENDPOINT_URL=/orchestrator
 *       VITE_RHINESTONE_CUSTOM_RPC_URLS='{"11155111":"http://127.0.0.1:8545"}'
 *       VITE_FF_EXPERIMENTAL_JWT=true
 *       VITE_SPONSORSHIP_API_URL=/api
 */
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import { clickThroughEnableSessions } from '../../../helpers/manager-auth.js'
import { findSearchInput } from '../../../helpers/search-input.js'

const DOMAIN_TO_REGISTER = `jwt-e2e-${Date.now().toString(36)}.eth`

test.describe('Gas sponsorship JWT hop (Rhinestone)', () => {
  test('mints a sponsorship extension token from the api-worker during a sponsored registration', async ({
    connectedPage: page,
  }) => {
    // This spec only holds when the manager under test was booted in JWT
    // sponsorship mode (VITE_FF_EXPERIMENTAL_JWT=true). The default manager-e2e
    // run does not enable it, so skip unless the run opts in explicitly — set
    // E2E_SPONSORSHIP_JWT=true alongside the JWT manager env to exercise it.
    test.skip(
      process.env.E2E_SPONSORSHIP_JWT !== 'true',
      'Set E2E_SPONSORSHIP_JWT=true (manager in VITE_FF_EXPERIMENTAL_JWT mode) to run',
    )

    // Capture sponsorship token mints as they happen. The SDK requests an
    // access token to authenticate to the orchestrator (per orchestrator call,
    // not a single cached session token) and a single-use extension token per
    // sponsored intent. The buy below drives the sponsored intent, so the
    // extension-token mint is the reliable in-body signal we assert on.
    const accessTokenStatuses: number[] = []
    const extensionTokenStatuses: number[] = []
    page.on('response', (res) => {
      const url = res.url()
      if (url.includes('/sponsorship/access-token')) {
        accessTokenStatuses.push(res.status())
      } else if (url.includes('/sponsorship/extension-token')) {
        extensionTokenStatuses.push(res.status())
      }
    })

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
    // HCA path: "Pay with stablecoins" opens the EnableSessions modal before the
    // token picker; click through the single auto-authorized ENABLE intent.
    await clickThroughEnableSessions(page)
    await page.getByText('USDC', { exact: true }).click()

    createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(
          `[Sponsorship JWT] ${state} (seen: ${allStates.join(' → ')})`,
        )
      },
    })

    await page.getByRole('button', { name: /buy name/i }).click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')
    await expect(successBanner).toContainText('Registration Complete', {
      timeout: 120_000,
    })

    // The sponsored intent(s) submitted during the buy must have minted at
    // least one extension token from the api-worker, and the worker must have
    // sponsored it (200). A denied intent would have come back 403 and failed
    // the buy before the success banner.
    expect(
      extensionTokenStatuses.length,
      `expected at least one /sponsorship/extension-token mint; saw none. ` +
        `access-token mints observed: ${accessTokenStatuses.join(', ') || 'none'}`,
    ).toBeGreaterThan(0)
    expect(
      extensionTokenStatuses.every((status) => status === 200),
      `all extension-token mints should be 200; saw: ${extensionTokenStatuses.join(', ')}`,
    ).toBe(true)

    // No extension-token mint should have been denied during a sponsored buy.
    expect(extensionTokenStatuses).not.toContain(403)
  })
})
