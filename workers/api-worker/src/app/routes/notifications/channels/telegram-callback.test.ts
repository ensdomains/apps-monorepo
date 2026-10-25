import { describe, expect, it } from 'vitest'
import { telegramCallbackPage } from './telegram-callback.js'

describe('Telegram callback page', () => {
  it('offers a Manager link only when one is configured', async () => {
    const options = { isSuccess: true, nonce: 'page-test-nonce' }
    const page = String(
      await telegramCallbackPage({
        ...options,
        managerUrl: 'https://sepolia.app.ens.domains',
      }),
    )
    expect(page).toContain('href="https://sepolia.app.ens.domains"')
    expect(String(await telegramCallbackPage(options))).not.toContain('<a ')
  })
})
