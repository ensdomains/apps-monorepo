import { describe, expect, it } from 'vitest'
import { telegramCallbackPage } from './telegram-callback.js'

describe('Telegram callback page', () => {
  it.each([true, false])(
    'shows return instructions and the correct outcome (success: %s)',
    async (isSuccess) => {
      const page = String(
        await telegramCallbackPage({
          isSuccess,
          nonce: 'page-test-nonce',
          managerUrl: 'https://sepolia.app.ens.domains',
        }),
      )
      expect(page).toContain(
        isSuccess
          ? '<h1>Telegram connected</h1>'
          : '<h1>Connection not completed</h1>',
      )
      expect(page).toContain(
        'return to your original tab to keep your progress',
      )
      expect(page).toContain('href="https://sepolia.app.ens.domains"')
      expect(page).not.toContain('<script')
    },
  )
})
