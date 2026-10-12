import type { Page } from '@playwright/test'

/**
 * Existing suites predate the consent banner: preset declined so it never
 * renders and analytics stays silent. (The consent walks in
 * projects/consent assert the banner itself and do not use this.)
 */
export const presetDeclinedConsent = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    // Must match CONSENT_STORAGE_KEY in @ens-apps/analytics-consent.
    localStorage.setItem('ens.analytics.consent', 'declined')
  })
}
