// e2e/projects/manager/tests/registration.spec.ts
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { type Address, parseAbi } from 'viem'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { expectFlowSuccess } from '../../../helpers/flow-completion.js'
import {
  authorizeHeadlessConnection,
  authorizeTransactionsWhile,
  clickThroughEnableSessions,
  dismissBackendAuthModal,
} from '../../../helpers/manager-auth.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const DISCONNECTED_DOMAIN = `e2e-${(Date.now() + 1).toString(36)}.eth`
const LATE_AUTH_DOMAIN = `e2e-${(Date.now() + 2).toString(36)}.eth`

const sepolia = ensL1Contracts[supportedL1Chains.sepolia]
const ETH_REGISTRAR = sepolia.ensEthRegistrar.address as Address
const USDC = sepolia.usdc.address as Address
const ORACLE_ABI = parseAbi([
  'function rentPriceOracle() view returns (address)',
  'function getBaseRates() view returns (uint256[])',
])
const REGISTER_PRICE_ABI = parseAbi([
  'function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)',
])

test.describe('ENS name registration', () => {
  test('user is unable to register a name when disconnected', {
    tag: ['@scenario:A16'],
  }, async ({ page }) => {
    // Navigate directly to the register page — the search-dropdown click path
    // is tested in the late-auth test below and in registration-rhinestone.spec.ts.
    // This test's actual assertion is that disconnected users see the
    // "Connect to Register" CTA, not that the search interaction works.
    const label = DISCONNECTED_DOMAIN.replace(/\.eth$/i, '')
    await page.goto(`${MANAGER_APP_URL}/register/${label}`)
    await page.waitForURL(/\/register\//, { timeout: 15_000 })
    await expect(
      page.getByRole('button', { name: /connect to register/i }),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('registers a name after connecting from the pricing page', {
    tag: ['@scenario:A16', '@smoke'],
  }, async ({ page, wallet }) => {
    // Navigate directly to avoid the fragile landing-page search-dropdown click
    // (getByText(domain) times out because the label and .eth are separate nodes).
    const label = LATE_AUTH_DOMAIN.replace(/\.eth$/i, '')
    await page.goto(`${MANAGER_APP_URL}/register/${label}`)
    await page.waitForURL(/\/register\//, { timeout: 15_000 })
    // Click "Connect to Register" with retry — the button can be a no-op if
    // the wallet layer hasn't hydrated yet, and the modal can close before we
    // interact with it. Same pattern as connectWithHeadlessWallet.
    const connectBtn = page.getByRole('button', {
      name: /connect to register/i,
    })
    const modal = page.getByRole('dialog')
    const headlessOption = page.getByText('Headless Web3 Provider')
    await expect(async () => {
      if (!(await modal.isVisible().catch(() => false))) {
        await connectBtn.click({ timeout: 5_000 }).catch(() => {})
      }
      await expect(headlessOption).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 40_000 })

    await authorizeHeadlessConnection(page, wallet)

    // Dismiss the SIWE modal before continuing to payment.
    await dismissBackendAuthModal(page)

    await page.getByRole('button', { name: /pay with stablecoins/i }).click()
    // On the smart-account / HCA path, "Pay with stablecoins" opens the
    // EnableSessions modal BEFORE the token picker, which blocks the USDC click.
    // Click through it (auto-authorized via PERMITTED_SIGN_KINDS). The helper is
    // idempotent — a no-op in EOA mode where the modal never appears.
    await clickThroughEnableSessions(page)
    await page.getByRole('button', { name: 'Select USDC', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Approve and register name' })
      .getByRole('button', { name: /^(approve and register|register name)$/i })
      .click()

    // RegistrationDetails (including the completion banner) stays hidden while
    // the parallel notification-settings region is waiting for a choice.
    await page.getByRole('button', { name: 'Set up later' }).click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')
    // Authorize the EOA registration transactions (deploy-resolver? → commit →
    // approve USDC → register) as they arrive while waiting for completion.
    // The completion banner is gated on the whole flow finishing, so once it
    // shows, polling stops without a dangling authorize or a fixed-length tail.
    let registrationComplete = false
    const authorizeAll = authorizeTransactionsWhile(
      page,
      wallet,
      () => registrationComplete,
    )
    await expectFlowSuccess(page, {
      success: successBanner.filter({ hasText: 'Registration Complete' }),
      failureTitle: 'Registration Failed',
      timeout: 180_000,
    })
    registrationComplete = true
    await authorizeAll
  })

  /**
   * A10 — `apps/manager/src/routes/register/$name.tsx`'s loader checks
   * availability before ever rendering the registration UI, and redirects
   * straight to the profile route for a name that isn't available. This
   * tests the loader's own behaviour, not a rendered "unavailable" message.
   */
  test('redirects to the profile page when the name is already registered', {
    tag: ['@scenario:A10'],
  }, async ({ connectedPage: page, makeName }) => {
    const name = await makeName({ label: 'already-registered-a10' })

    await page.goto(`${MANAGER_APP_URL}/register/${name}`)

    await page.waitForURL(new RegExp(`/${name.replace(/\./g, '\\.')}$`), {
      timeout: 15_000,
    })
    // Confirms the redirect landed on a real profile render, not a blank
    // route or an error boundary that happens to match the URL pattern.
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Registration pricing against the oracle (A23)', () => {
  test('each duration preset shows the registrar’s own price, and its saving against the yearly rate', {
    tag: ['@scenario:A23'],
  }, async ({ connectedPage: page }) => {
    const label = `a23${Date.now().toString(36)}`
    await page.goto(`${MANAGER_APP_URL}/register/${label}.eth`)
    const presets = page.getByRole('button', {
      name: /\d years? \$[\d.,]+\/year/,
    })
    await expect(presets.first()).toBeVisible({ timeout: 60_000 })
    await page.waitForLoadState('networkidle')

    // A preset's duration, exactly as the page sizes it (register-v2/utils/
    // time.ts getDurationInSecondsFromYears): the longer of years × 365.25
    // days and the whole calendar days from local midnight — computed in the
    // browser so "local" is the page's own timezone.
    const durationFor = async (years: number) =>
      BigInt(
        await page.evaluate((y) => {
          const start = new Date()
          start.setHours(0, 0, 0, 0)
          const end = new Date(start)
          end.setFullYear(end.getFullYear() + y)
          const days = Math.round(
            (end.getTime() - start.getTime()) / 86_400_000,
          )
          return Math.max(y * 365.25 * 86_400, days * 86_400)
        }, years),
      )
    const oracle = await publicClient.readContract({
      address: ETH_REGISTRAR,
      abi: ORACLE_ABI,
      functionName: 'rentPriceOracle',
    })
    const rates = await publicClient.readContract({
      address: oracle,
      abi: ORACLE_ABI,
      functionName: 'getBaseRates',
    })
    const baseRate = rates[Math.min(label.length, rates.length) - 1]
    const prices = async (years: number) => {
      const duration = await durationFor(years)
      const [base] = await publicClient.readContract({
        address: ETH_REGISTRAR,
        abi: REGISTER_PRICE_ABI,
        functionName: 'getRegisterPrice',
        args: [label, duration, USDC],
      })
      return {
        discounted: Number(base) / 1e6,
        // The undiscounted price the page compares against (discount.ts).
        undiscounted: Number(duration * baseRate) / 1e12,
      }
    }
    const dollars = (text: string, pattern: RegExp) => {
      const match = text.match(pattern)
      if (!match) throw new Error(`no ${pattern} in "${text}"`)
      return Number(match[1].replace(/,/g, ''))
    }

    for (const text of await presets.allInnerTexts()) {
      const flat = text.replace(/\s+/g, ' ')
      const years = Number(flat.match(/(\d+) years?/)?.[1])
      const shownBase = dollars(flat, /\$([\d,]+\.\d{2}) base price/)
      const { discounted, undiscounted } = await prices(years)
      console.log(
        `[A23] ${years}y: shown $${shownBase}, oracle $${discounted.toFixed(4)}, undiscounted $${undiscounted.toFixed(4)}`,
      )
      expect(
        Math.abs(shownBase - discounted),
        `${years} years: the base price is the oracle's`,
      ).toBeLessThan(0.006)
      if (years > 1) {
        await page
          .getByRole('button', { name: new RegExp(`${years} years`) })
          .click()
        // The summary renders its text in fragments; compare it unspaced.
        await expect
          .poll(async () =>
            (await page.locator('main').innerText()).replace(/\s+/g, ''),
          )
          .toContain(`Registeringfor${years}years`)
        // The saving is an animated digit counter; its accessible label holds
        // the settled amount.
        const saveAmount = page
          .locator('span', { hasText: /^\s*Save/ })
          .locator('[aria-label^="$"]')
          .first()
        const expectedSave = undiscounted - discounted
        await expect
          .poll(
            async () =>
              Math.abs(
                dollars(
                  (await saveAmount.getAttribute('aria-label')) ?? '',
                  /\$([\d,]+\.\d{2})/,
                ) - expectedSave,
              ),
            {
              timeout: 15_000,
              message: `${years} years: saving = undiscounted − discounted price ($${expectedSave.toFixed(4)})`,
            },
          )
          .toBeLessThan(0.011)
      }
    }
  })
})

test.describe('Registration progress (A25)', () => {
  test('the name fill only moves forward, and reaches 100% only once the registration has succeeded', {
    tag: ['@scenario:A25'],
  }, async ({ connectedPage: page, wallet }) => {
    test.setTimeout(300_000)
    const label = `a25${Date.now().toString(36)}`.slice(0, 10)
    await page.goto(`${MANAGER_APP_URL}/register/${label}.eth`)
    await page.getByRole('button', { name: /pay with stablecoins/i }).click()
    await clickThroughEnableSessions(page)
    await page.getByRole('button', { name: 'Select USDC' }).click()

    // Sample from inside the page. The weave fill draws progress as
    // `clip-path: inset(0 X% 0 0)` on the name's line (one line for a short
    // name), so progress = 100 − X. The fill unmounts once success shows, so
    // the moment "Registration Complete" appears is noted separately.
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>
      const fill: { t: number; p: number }[] = []
      w.__fill = fill
      w.__doneAt = null
      w.__fillTimer = window.setInterval(() => {
        if (
          w.__doneAt === null &&
          document.body.innerText.includes('Registration Complete')
        )
          w.__doneAt = Date.now()
        const line = [
          ...document.querySelectorAll<HTMLElement>('[style*="clip-path"]'),
        ].find((el) => el.style.clipPath.startsWith('inset('))
        const inset = Number(
          line?.style.clipPath.match(/inset\(0(?:px)? ([\d.]+)%/)?.[1] ?? 'NaN',
        )
        if (!Number.isNaN(inset)) fill.push({ t: Date.now(), p: 100 - inset })
      }, 100)
    })

    await page.getByRole('button', { name: /register name/i }).click()
    await page.getByRole('button', { name: 'Set up later' }).click()
    let complete = false
    const authorizing = authorizeTransactionsWhile(page, wallet, () => complete)
    await expectFlowSuccess(page, {
      success: page
        .locator('p.text-ens-peridot-text-dark')
        .filter({ hasText: 'Registration Complete' }),
      failureTitle: 'Registration Failed',
      timeout: 180_000,
    })
    complete = true
    await authorizing

    const { fill, doneAt } = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>
      window.clearInterval(w.__fillTimer as number)
      return {
        fill: w.__fill as { t: number; p: number }[],
        doneAt: w.__doneAt as number | null,
      }
    })
    console.log(
      `[A25] ${fill.length} samples, ${fill[0]?.p.toFixed(1)}% → ${fill.at(-1)?.p.toFixed(1)}%`,
    )
    expect(
      fill.length,
      'the fill was observed during the flow',
    ).toBeGreaterThan(10)
    const regressions = fill.filter(
      (s, i) => i > 0 && s.p < fill[i - 1].p - 0.5,
    )
    expect(regressions, 'the fill never moves backwards').toEqual([])

    // The app sweeps the fill to 100% on success, then shows the banner once
    // the fill settles — so 100% leads the banner by a beat. A full fill while
    // transactions are still pending would lead it by much more.
    const firstFull = fill.find((s) => s.p >= 99.5)
    expect(firstFull, 'the fill reaches 100%').toBeTruthy()
    expect(doneAt, 'success was observed').not.toBeNull()
    const lead = (doneAt ?? 0) - (firstFull?.t ?? 0)
    console.log(`[A25] 100% fill led the success banner by ${lead} ms`)
    expect(lead, '100% only at success, not while pending').toBeLessThan(3_000)
  })
})

/** Poll `page` until one of `outcomes` shows (or the URL leaves /register/). */
async function firstOutcome(
  page: import('@playwright/test').Page,
  outcomes: Record<string, import('@playwright/test').Locator>,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const [key, locator] of Object.entries(outcomes))
      if (await locator.isVisible().catch(() => false)) return key
    if (!page.url().includes('/register/')) return 'redirected'
    await page.waitForTimeout(500)
  }
  return 'none'
}

test.describe('Two registrations of one label (A22)', () => {
  test('the label is taken while this tab is mid-checkout: the tab says so instead of hanging', {
    tag: ['@scenario:A22'],
  }, async ({ connectedPage: page, wallet, makeV2Name }) => {
    test.fail(
      true,
      'E2E-030: the losing tab shows "Error loading name" instead of saying the name was taken',
    )
    test.setTimeout(400_000)
    const label = `a22${Date.now().toString(36)}`
    await page.goto(`${MANAGER_APP_URL}/register/${label}.eth`)
    await page.getByRole('button', { name: /pay with stablecoins/i }).click()
    await clickThroughEnableSessions(page)
    await page.getByRole('button', { name: 'Select USDC' }).click()

    // The other tab wins: the label is registered (by someone else) now.
    await makeV2Name({ label, exactLabel: true, owner: 'other' })

    const clickedAt = Date.now()
    await page.getByRole('button', { name: /register name/i }).click()
    await page
      .getByRole('button', { name: 'Set up later' })
      .click({ timeout: 10_000 })
      .catch(() => undefined)
    let settled = false
    const authorizing = authorizeTransactionsWhile(page, wallet, () => settled)
    const outcome = await firstOutcome(
      page,
      {
        told: page
          .getByText(
            /not available|already registered|is taken|no longer available|unavailable/i,
          )
          .first(),
        failed: page.getByText('Registration Failed').first(),
        won: page.getByText('Registration Complete').first(),
        errorLoading: page.getByText(/Error loading name/).first(),
      },
      240_000,
    )
    settled = true
    await Promise.race([authorizing, page.waitForTimeout(5_000)])
    console.log(
      `[A22] outcome: ${outcome} after ${Date.now() - clickedAt} ms; url ${page.url()}`,
    )
    expect(outcome, 'the loser is never told it won').not.toBe('won')
    expect(outcome, 'and is not left hanging').not.toBe('none')
    // Measured: "Error loading name: Try again", ~1 min in (after the
    // commitment wait); "Try again" opens /<name> still showing the
    // registration presets. The tab must instead say the name was taken.
    expect(outcome, 'the tab says the name was taken (E2E-030)').toBe('told')
  })
})
