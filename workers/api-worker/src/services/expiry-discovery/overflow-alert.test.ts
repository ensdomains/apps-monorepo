import { errAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { makeTelegramRequest } from '#services/telegram/utils.js'
import { logger } from '#utils/logger.js'
import { EXACT_TIMESTAMP_MAX_ROWS } from './indexer.js'
import { reportExpiryTimestampOverflow } from './overflow-alert.js'

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
        trackId: 'ens_v1_reserved',
        stageId: 'grace-7d',
        expiryTimestamp: 1_700_000_000,
        processedCount: EXACT_TIMESTAMP_MAX_ROWS,
      }),
    ).resolves.toBeUndefined()

    expect(errorLog).toHaveBeenCalledWith(
      'Expiry discovery exact-timestamp bucket saturated',
      expect.objectContaining({
        track: 'ens_v1_reserved',
        stage: 'grace-7d',
        expiryTimestamp: 1_700_000_000,
        expiryTimestampIso: expect.any(String),
        processedCount: EXACT_TIMESTAMP_MAX_ROWS,
        maxPerTimestamp: EXACT_TIMESTAMP_MAX_ROWS,
        detail: expect.any(String),
      }),
    )
    expect(errorLog).toHaveBeenCalledWith(
      'Expiry overflow Telegram alert failed',
      expect.objectContaining({ stage: 'grace-7d' }),
    )
  })
})
