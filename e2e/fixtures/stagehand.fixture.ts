import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Stagehand } from '@browserbasehq/stagehand'
import { test as base } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

loadEnv({ path: path.resolve(__dirname, '..', '.env') })

export type StagehandFixture = {
  stagehand: Stagehand
}

/**
 * Stagehand fixture: initializes Stagehand with local browser, action caching, and cleanup.
 * Uses cacheDir so actions are cached and reused (auto-repair on failure via helpers).
 */
export const test = base.extend<StagehandFixture>({
  stagehand: async ({ }, use) => {
    const cacheDir = path.resolve(__dirname, '../cache/registration')
    console.log('cacheDir', cacheDir)
    const stagehand = new Stagehand({
      env: 'LOCAL',
      // cacheDir,
      model: "anthropic/claude-haiku-4-5",
      verbose: process.env.CI ? 0 : 1,
    })
    await stagehand.init()
    try {
      await use(stagehand)
    } finally {
      await stagehand.close()
    }
  },
})

export { expect } from '@playwright/test'
