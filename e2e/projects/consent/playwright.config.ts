import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

/**
 * Analytics-consent acceptance project (WEB-1741).
 *
 * Walks the ticket's checks C1-C5 against both apps with their PostHog host
 * pointed at the in-process recording stub (see posthog-stub.ts). The app
 * servers are started externally with the stub as their PostHog host:
 *
 *   VITE_PUBLIC_POSTHOG_HOST=http://127.0.0.1:4871 VITE_PUBLIC_POSTHOG_KEY=test-key \
 *     pnpm --filter manager dev    # :3000
 *   VITE_PUBLIC_POSTHOG_HOST=http://127.0.0.1:4871 VITE_PUBLIC_POSTHOG_KEY=test-key \
 *     pnpm --filter portal dev     # :3001
 *
 * Then: pnpm exec playwright test --config=projects/consent/playwright.config.ts
 * (from e2e/).
 */
export default defineConfig({
  ...baseConfig,
  testDir: './tests',
  use: {
    ...baseConfig.use,
    launchOptions: {
      // Full Chromium, not the headless shell: the shell's HeadlessChrome
      // user agent trips PostHog's bot filter, which silently drops every
      // capture the walks assert on.
      channel: 'chromium',
      args: [
        ...(process.env.CI
          ? [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
            ]
          : []),
        // PostHog's bot filter silently drops every capture while
        // navigator.webdriver is true; the walks emulate a human visitor.
        '--disable-blink-features=AutomationControlled',
      ],
    },
  },
  projects: [
    {
      name: 'consent',
      testMatch: /.*\.spec\.ts$/,
    },
  ],
})
