import type { Page } from '@playwright/test'

export async function captureHistoryFailure(
  page: Page,
  screenshotPath: string,
) {
  const screen = await page
    .locator('body')
    .innerText({ timeout: 1000 })
    .catch(() => '')
  const loadedHistoryError = await page
    .getByText(/^(Error loading history|Error loading page)$/)
    .isVisible()
    .catch(() => false)
  const screenshot = await page
    .screenshot({ path: screenshotPath, fullPage: true, timeout: 5000 })
    .then(() => screenshotPath)
    .catch(() => undefined)
  return {
    url: page.url(),
    closed: page.isClosed(),
    screen,
    loadedHistoryError,
    screenshot,
  }
}

export function historyFailureResult(
  phase: string,
  serverFailure: boolean,
  display?: { closed: boolean; loadedHistoryError: boolean },
) {
  if (serverFailure || display?.loadedHistoryError) return 'FAIL' as const
  if (display?.closed) return 'BLOCKED' as const
  return phase === 'Explorer history display'
    ? ('FAIL' as const)
    : ('BLOCKED' as const)
}
