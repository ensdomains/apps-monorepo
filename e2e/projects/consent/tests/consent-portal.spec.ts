import { expect, type Page, test } from '@playwright/test'
import { connectWithHeadlessWallet } from '../../../helpers/portal-auth.js'
import { emulateHumanVisitor } from '../human-visitor.js'
import {
  eventNamesIn,
  isEnvironmentalProbe,
  type PosthogStub,
  scannableBodies,
  startPosthogStub,
} from '../posthog-stub.js'
import { injectTestWallet } from '../wallet.js'

const APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const CONSENT_KEY = 'ens.analytics.consent'

let stub: PosthogStub

test.beforeAll(async () => {
  stub = await startPosthogStub()
})

test.afterAll(async () => {
  await stub.close()
})

test.beforeEach(async ({ page }) => {
  stub.clear()
  await emulateHumanVisitor(page)
})

type Box = { x: number; y: number; width: number; height: number }

const boxesOverlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + b.height

const banner = (page: Page) => page.getByTestId('analytics-consent-banner')

const expectNoPosthogStorage = async (page: Page): Promise<void> => {
  const keys = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    cookie: document.cookie,
  }))
  const owned = (name: string) =>
    name.startsWith('ph_') || name.startsWith('__ph_')
  expect(keys.local.filter(owned), 'localStorage PostHog keys').toEqual([])
  expect(keys.session.filter(owned), 'sessionStorage PostHog keys').toEqual([])
  expect(
    keys.cookie
      .split(';')
      .map((c) => c.split('=')[0]?.trim() ?? '')
      .filter(owned),
    'PostHog cookies',
  ).toEqual([])
}

const bodiesCarryWallet = (wallet: string): boolean =>
  stub
    .requests()
    .filter((r) => !isEnvironmentalProbe(r))
    .flatMap((r) => scannableBodies(r.body))
    .some((body) => body.toLowerCase().includes(wallet.toLowerCase()))

const expectSilentHost = (wallet: string): void => {
  for (const r of stub.requests()) {
    if (isEnvironmentalProbe(r)) continue
    expect(
      r.path.includes('/config') ||
        r.path.includes('/flags') ||
        r.path.includes('/decide'),
      `unexpected PostHog request: ${r.method} ${r.path}`,
    ).toBe(true)
  }
  expect(bodiesCarryWallet(wallet), 'wallet address in a request body').toBe(
    false,
  )
  expect(stub.eventBodies()).toEqual([])
}

const disconnectPortalWallet = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /wallet menu for/i }).click()
  await page.getByRole('menuitem', { name: /disconnect/i }).click()
  await expect(
    page.getByRole('button', { name: /^connect( wallet)?$/i }),
  ).toBeVisible({ timeout: 15_000 })
}

/** Best-effort name search; returns whether a result was opened. */
const trySearch = async (page: Page): Promise<boolean> => {
  const input = page.getByPlaceholder(/search/i).first()
  if (!(await input.isVisible().catch(() => false))) {
    test.info().annotations.push({
      type: 'coverage',
      description: 'no search input rendered; search not covered',
    })
    return false
  }
  await input.fill('nick.eth')
  await page.waitForTimeout(3_000)
  const suggestion = page.getByRole('option', { name: /nick\.eth/i }).first()
  if (!(await suggestion.isVisible().catch(() => false))) {
    test.info().annotations.push({
      type: 'coverage',
      description: 'search suggestions did not render; search not covered',
    })
    return false
  }
  await suggestion.click()
  return true
}

test('C1: banner offers equal buttons and a notice link until chosen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(APP_URL)
  const card = banner(page)
  await expect(card).toBeVisible({ timeout: 20_000 })

  const accept = page.getByRole('button', { name: 'Accept Analytics' })
  const decline = page.getByRole('button', { name: 'Decline' })
  await expect(accept).toBeVisible()
  await expect(decline).toBeVisible()
  const acceptBox = await accept.boundingBox()
  const declineBox = await decline.boundingBox()
  if (!acceptBox || !declineBox) throw new Error('buttons have no boxes')
  expect(Math.abs(acceptBox.width - declineBox.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(acceptBox.height - declineBox.height)).toBeLessThanOrEqual(1)

  await card.getByRole('link', { name: /privacy/i }).click()
  await expect(page).toHaveURL(new RegExp(`^${APP_URL}/`))
  await expect(
    page.getByRole('heading', { name: /privacy notice/i }),
  ).toBeVisible()
  await page.goBack()
  await expect(card).toBeVisible()

  await decline.click()
  await expect(card).toBeHidden({ timeout: 10_000 })
  await page.reload()
  await expect(card).toBeHidden()
  expect(
    await page.evaluate((key) => localStorage.getItem(key), CONSENT_KEY),
  ).toBe('declined')
})

test('C1: banner stays gone across connect and disconnect', async ({
  page,
}) => {
  const { wallet } = await injectTestWallet(page)
  await page.goto(APP_URL)
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Decline' }).click()
  await connectWithHeadlessWallet(page, wallet)
  await expect(banner(page)).toBeHidden()
  await disconnectPortalWallet(page)
  await page.reload()
  await expect(banner(page)).toBeHidden()
})

test('C1: floating card at phone and desktop widths, light and dark', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto(APP_URL)
  const card = banner(page)
  await expect(card).toBeVisible({ timeout: 20_000 })
  const phoneBox = await card.boundingBox()
  if (!phoneBox) throw new Error('banner has no box at 360px')
  expect(phoneBox.x).toBeGreaterThanOrEqual(0)
  expect(phoneBox.x + phoneBox.width).toBeLessThanOrEqual(360)
  expect(phoneBox.y).toBeLessThan(300)
  const headerBox = await page.locator('header').first().boundingBox()
  if (!headerBox) throw new Error('header has no box')
  expect(boxesOverlap(phoneBox, headerBox)).toBe(false)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )
  expect(overflow, 'no sideways scroll at 360px').toBe(true)
  await page.screenshot({ path: testInfo.outputPath('banner-360.png') })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(500)
  const desktopBox = await card.boundingBox()
  if (!desktopBox) throw new Error('banner has no box at 1280px')
  expect(desktopBox.x).toBeGreaterThan(640)
  expect(desktopBox.y + desktopBox.height).toBeGreaterThan(500)
  const headerBoxWide = await page.locator('header').first().boundingBox()
  if (!headerBoxWide) throw new Error('header has no box at 1280px')
  expect(boxesOverlap(desktopBox, headerBoxWide)).toBe(false)
  const settingsBox = await page
    .getByRole('button', { name: 'Settings' })
    .first()
    .boundingBox()
    .catch(() => null)
  if (settingsBox) {
    expect(boxesOverlap(desktopBox, settingsBox)).toBe(false)
  }
  const helpBox = await page
    .getByRole('button', { name: /help/i })
    .first()
    .boundingBox()
    .catch(() => null)
  if (helpBox) {
    expect(boxesOverlap(desktopBox, helpBox)).toBe(false)
  } else {
    testInfo.annotations.push({
      type: 'coverage',
      description: 'help button not found; help overlap not covered',
    })
  }
  await page.screenshot({ path: testInfo.outputPath('banner-1280.png') })

  await page.addInitScript(() => {
    localStorage.setItem('ens-portal-theme', 'dark')
  })
  await page.reload()
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('html.dark')).toBeAttached()
  await page.screenshot({ path: testInfo.outputPath('banner-1280-dark.png') })
})

test('C2: declined visitor sends no usage and no wallet', async ({ page }) => {
  const { wallet, address } = await injectTestWallet(page)
  await page.goto(APP_URL)
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await page.goto(`${APP_URL}/vitalik.eth`)
  await connectWithHeadlessWallet(page, wallet)
  await trySearch(page)
  await page.getByRole('button', { name: 'Decline' }).click()
  await page.goto(`${APP_URL}/vitalik.eth`)
  await page.waitForTimeout(3_000)
  expectSilentHost(address)
  await expectNoPosthogStorage(page)
})

test('C2: pre-choice visitor is silent too', async ({ page }) => {
  const { wallet, address } = await injectTestWallet(page)
  await page.goto(APP_URL)
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`${APP_URL}/vitalik.eth`)
  await page.waitForTimeout(3_000)
  expectSilentHost(address)
  await expectNoPosthogStorage(page)
})

test('C3a: accept with no wallet, then connect links the wallet', async ({
  page,
}) => {
  const { wallet, address } = await injectTestWallet(page)
  await page.goto(APP_URL)
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Accept Analytics' }).click()
  await expect(banner(page)).toBeHidden({ timeout: 10_000 })
  await page.waitForTimeout(2_000)
  for (const raw of stub.eventBodies()) {
    for (const body of scannableBodies(raw)) {
      expect(
        body.toLowerCase().includes(address.toLowerCase()),
        'no wallet before connect',
      ).toBe(false)
    }
  }
  await connectWithHeadlessWallet(page, wallet)
  await page.waitForTimeout(2_000)
  const names = eventNamesIn(stub.eventBodies())
  expect(names).toContain('$identify')
  expect(
    stub
      .eventBodies()
      .flatMap(scannableBodies)
      .some((b) => b.includes(address)),
    'a request ties the wallet to the visitor',
  ).toBe(true)
  expect(names).toContain('wallet:connect')
  await page.goto(`${APP_URL}/vitalik.eth`)
  await page.waitForTimeout(2_000)
  expect(eventNamesIn(stub.eventBodies())).toContain('$pageview')
})

test('C3b: accept with a connected wallet links at once', async ({ page }) => {
  const { wallet, address } = await injectTestWallet(page)
  await page.goto(APP_URL)
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await connectWithHeadlessWallet(page, wallet)
  stub.clear()
  await page.getByRole('button', { name: 'Accept Analytics' }).click()
  await page.waitForTimeout(3_000)
  expect(
    stub
      .eventBodies()
      .flatMap(scannableBodies)
      .some((b) => b.includes(address)),
    'wallet linked from the press',
  ).toBe(true)
  const names = eventNamesIn(stub.eventBodies())
  expect(names).toContain('$pageview')
  expect(names).not.toContain('intercom:booted')
  expect(
    stub.requests().some((r) => r.path.startsWith('/s/')),
    'no recording requests',
  ).toBe(false)
  expect(
    stub.requests().some((r) => r.path.includes('survey')),
    'no survey requests',
  ).toBe(false)
})

test('C4: the notice switch stops and resumes analytics at once', async ({
  page,
}) => {
  const { wallet } = await injectTestWallet(page)
  await page.goto(APP_URL)
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Accept Analytics' }).click()
  await connectWithHeadlessWallet(page, wallet)
  await banner(page)
    .getByRole('link', { name: /privacy/i })
    .click()
    .catch(() => page.goto(`${APP_URL}/privacy`))
  const consentSwitch = page.getByTestId('analytics-consent-switch')
  await expect(consentSwitch).toBeVisible()
  await consentSwitch.click() // to Decline
  await page.waitForTimeout(1_000)
  const countAtDecline = stub.eventBodies().length
  await page.goto(`${APP_URL}/vitalik.eth`)
  await page.mouse.click(640, 400)
  await page.waitForTimeout(3_000)
  expect(stub.eventBodies().length, 'no events after declining').toBe(
    countAtDecline,
  )
  await expectNoPosthogStorage(page)
  await page.goto(`${APP_URL}/privacy`)
  await consentSwitch.click() // back to Accept
  await page.goto(`${APP_URL}/vitalik.eth`)
  await page.waitForTimeout(3_000)
  expect(
    stub.eventBodies().length,
    'events resume after re-accepting',
  ).toBeGreaterThan(countAtDecline)
  // A stored accept loads opted-in; declining then must also leave nothing.
  await page.goto(`${APP_URL}/privacy`)
  await page.reload()
  await expect(consentSwitch).toBeVisible()
  await consentSwitch.click() // to Decline after a stored-accept load
  await page.waitForTimeout(1_000)
  const countAfterReloadDecline = stub.eventBodies().length
  await page.goto(`${APP_URL}/vitalik.eth`)
  await page.mouse.click(640, 400)
  await page.waitForTimeout(3_000)
  expect(
    stub.eventBodies().length,
    'no events after declining a stored accept',
  ).toBe(countAfterReloadDecline)
  await expectNoPosthogStorage(page)
})

test('C5: the notice names the collection and the choice', async ({ page }) => {
  await page.goto(APP_URL)
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await banner(page)
    .getByRole('link', { name: /privacy/i })
    .click()
  await expect(
    page.getByRole('heading', { name: /privacy notice/i }),
  ).toBeVisible()
  for (const phrase of [
    /wallet addresses/i,
    /browser details/i,
    /page visits/i,
    /usage events/i,
    /purposes/i,
    /PostHog/,
    /privacy@ens\.domains/,
  ]) {
    await expect(page.getByText(phrase).first()).toBeVisible()
  }
  await expect(page.getByTestId('analytics-consent-status')).toContainText(
    /no choice/i,
  )
  await expect(page.getByTestId('analytics-consent-switch')).toBeVisible()
  await expect(
    page.getByRole('link', { name: /full privacy policy/i }),
  ).toBeVisible()
})

test('C5: the help menu opens the notice inside the app', async ({ page }) => {
  await page.goto(APP_URL)
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Decline' }).click()
  // The home page hides the sidebar; the help menu lives in the footers of
  // the entity sidebars, so open a contract page to reach it.
  await page.goto(
    `${APP_URL}/resolver/0x640294a2b2d87e7f522db3e3e3e876764bce170d`,
  )
  const helpTrigger = page.getByRole('button', { name: /help/i }).first()
  await expect(helpTrigger).toBeVisible({ timeout: 20_000 })
  await helpTrigger.click()
  await page.getByRole('link', { name: /privacy policy/i }).click()
  await expect(page).toHaveURL(new RegExp(`^${APP_URL}/`))
  await expect(
    page.getByRole('heading', { name: /privacy notice/i }),
  ).toBeVisible()
})
