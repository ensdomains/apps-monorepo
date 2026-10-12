import type { Page } from '@playwright/test'

/** Normal desktop Chrome identity, without the HeadlessChrome brand. */
const HUMAN_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

/**
 * Emulate a human visitor before navigation. PostHog's bot filter silently
 * drops every capture when the UA or UA brands advertise HeadlessChrome or
 * navigator.webdriver is true, and these walks assert on captures.
 */
export const emulateHumanVisitor = async (page: Page): Promise<void> => {
  await page.addInitScript((ua: string) => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
    Object.defineProperty(navigator, 'userAgent', { get: () => ua })
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => ({
        brands: [
          { brand: 'Chromium', version: '145' },
          { brand: 'Google Chrome', version: '145' },
          { brand: 'Not-A.Brand', version: '24' },
        ],
        platform: 'macOS',
      }),
    })
  }, HUMAN_USER_AGENT)
}
