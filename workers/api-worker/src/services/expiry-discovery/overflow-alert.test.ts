import { errAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { makeTelegramRequest } from '#services/telegram/utils.js'
import { logger } from '#utils/logger.js'
import { reportExpiryTimestampOverflow } from './overflow-alert.js'
import { MAX_NAMES_PER_SOURCE } from './page.js'

vi.mock('#services/telegram/utils.js', () => ({
  makeTelegramRequest: vi.fn(),
}))

describe('expiry timestamp overflow reporting', () => {
  it('always logs structured saturation telemetry and ignores alert failure', async () => {
    vi.mocked(makeTelegramRequest).mockReturnValue(
      errAsync(new Error('telegram unavailable') as never),
    )
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {})

    await expect(
      reportExpiryTimestampOverflow({
        env: {
          TELEGRAM: { ALERT_CHAT_ID: '-123' },
          TELEGRAM_BOT_TOKEN: 'token',
        } as unknown as CloudflareBindings,
        stageId: 'grace-7d',
        expiryTimestamp: 1_700_000_000,
        processedCount: 1000,
      }),
    ).resolves.toBeUndefined()

    expect(errorLog).toHaveBeenCalledWith(
      'Expiry discovery exact-timestamp bucket saturated',
      expect.objectContaining({
        stage: 'grace-7d',
        expiryTimestamp: 1_700_000_000,
        expiryTimestampIso: expect.any(String),
        processedCount: 1000,
        maxPerTimestamp: MAX_NAMES_PER_SOURCE,
        detail: expect.any(String),
      }),
    )
    expect(errorLog).toHaveBeenCalledWith(
      'Expiry overflow Telegram alert failed',
      expect.objectContaining({ stage: 'grace-7d' }),
    )
  })
})
