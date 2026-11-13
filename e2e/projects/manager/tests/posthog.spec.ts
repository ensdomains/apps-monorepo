import { expect, test } from '@playwright/test'
import {
  mockManagerPostHog,
  overrideManagerFeatureFlags,
  waitForManagerFeatureFlagOverride,
} from '../../../fixtures/playwright.manager.fixture.js'

test('local feature flag overrides work without analytics consent @smoke', async ({
  page,
}) => {
  await mockManagerPostHog(page)
  await page.context().addCookies([
    {
      name: 'ens_analytics_consent',
      value: '0',
      url: process.env.MANAGER_APP_URL ?? 'http://localhost:3000',
    },
  ])
  await overrideManagerFeatureFlags(page, {
    'profile-view-new': true,
    migration: false,
  })
  await page.goto(process.env.MANAGER_APP_URL ?? 'http://localhost:3000')
  await waitForManagerFeatureFlagOverride(page)
  const state = await page.evaluate(() => {
    const client = (
      window as Window & {
        readonly posthog?: {
          isFeatureEnabled: (key: string) => boolean | undefined
          get_explicit_consent_status: () => string
          capture: (event: string) => unknown
        }
      }
    ).posthog
    if (!client) throw new Error('PostHog was not initialized')
    return {
      profile: client.isFeatureEnabled('profile-view-new'),
      migration: client.isFeatureEnabled('migration'),
      consent: client.get_explicit_consent_status(),
      capture: client.capture('wallet:connect'),
    }
  })
  expect(state).toEqual({
    profile: true,
    migration: false,
    consent: 'denied',
    capture: undefined,
  })
})
