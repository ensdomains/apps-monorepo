import { defineConfig } from '@playwright/test'
import portalConfig from './playwright.config.js'

/**
 * The portal config, instrumented for **human review** rather than CI.
 *
 * The normal config keeps `video`/`trace`/`screenshot` on `retain-on-failure`,
 * which is right for a suite you run constantly — a green run leaves nothing
 * behind and costs nothing. But it means a passing test is invisible, and
 * "passed" is exactly what you want to watch when you are judging whether a
 * PR behaves correctly rather than merely whether it is green.
 *
 * This turns all three on unconditionally and swaps the `list` reporter for
 * the HTML one, so every test — passing included — lands in the report with a
 * video attached.
 *
 *   pnpm --filter @ens-apps/e2e exec playwright test \
 *     --config=projects/portal/playwright.review.config.ts \
 *     --grep "@scenario:F15"
 *   pnpm --filter @ens-apps/e2e exec playwright show-report playwright-report
 *
 * Or via the shorthand: `pnpm e2e:portal:review --grep "…"`.
 *
 * Deliberately **not** the default: recording video for every test roughly
 * doubles wall-clock on a long run and leaves hundreds of megabytes behind, and
 * `trace: 'on'` costs more again. Reach for this when you want to look at
 * something, not when you want to know if it is broken.
 */
export default defineConfig({
  ...portalConfig,
  reporter: [['html', { open: 'never' }]],
  use: {
    ...portalConfig.use,
    video: 'on',
    trace: 'on',
    screenshot: 'on',
  },
})
