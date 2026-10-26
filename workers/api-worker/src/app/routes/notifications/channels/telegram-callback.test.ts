import { describe, expect, it } from 'vitest'
import { intoDbError } from '#core/database/index.js'
import {
  TelegramAttemptRecoveryError,
  TelegramTokenExchangeError,
} from '#services/telegram/errors.js'
import { telegramCallbackPage } from './telegram-callback.js'

describe('Telegram callback page', () => {
  it.each([false, true])(
    'explains token timeouts and how to retry with messaging enabled (recovery failure: %s)',
    async (hasRecoveryFailure) => {
      const timeout = new TelegramTokenExchangeError({
        stage: 'request',
        cause: new DOMException('private provider diagnostic', 'TimeoutError'),
      })
      const error = hasRecoveryFailure
        ? new TelegramAttemptRecoveryError({
            attemptId: 'private-attempt-id',
            operation: 'record_failure',
            failure: timeout,
            cause: intoDbError(new Error('private database diagnostic')),
          })
        : timeout
      const page = String(
        await telegramCallbackPage({ isSuccess: false, nonce: 'nonce', error }),
      )
      expect(page).toContain('<h1>Telegram sign-in timed out</h1>')
      expect(page).toContain('start a new connection')
      expect(page).toContain('allow the notification bot to send you messages')
      expect(page).not.toContain('private')
    },
  )

  it('does not present an unrelated network failure as a timeout or confirmed permission denial', async () => {
    const error = new TelegramTokenExchangeError({
      stage: 'request',
      cause: new TypeError('private network error'),
    })
    const page = String(
      await telegramCallbackPage({ isSuccess: false, nonce: 'nonce', error }),
    )
    expect(page).toContain('<h1>Connection not completed</h1>')
    expect(page).not.toContain('sign-in timed out')
    expect(page).not.toContain('private')
  })

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
