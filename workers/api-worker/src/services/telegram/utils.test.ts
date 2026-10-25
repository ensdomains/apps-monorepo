import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTelegramRequest } from './utils.js'

afterEach(() => vi.restoreAllMocks())

describe('Telegram Bot API request diagnostics', () => {
  it('preserves the original transport error and identifies the operation', async () => {
    const cause = new DOMException('request timed out', 'TimeoutError')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(cause)
    const result = await makeTelegramRequest('test-token', 'sendMessage', {
      chat_id: 123,
      text: 'test',
    })
    expect(result.isErr()).toBe(true)
    if (result.isErr())
      expect(result.error).toMatchObject({
        code: 'TELEGRAM_API_REQUEST_ERROR',
        stage: 'request',
        method: 'sendMessage',
        error: cause,
      })
  })

  it.each([
    ['not JSON', 'decode'],
    [JSON.stringify({ unexpected: true }), 'response'],
  ])(
    'retains HTTP status for an invalid response (%s)',
    async (body, stage) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(body, { status: 502 }),
      )
      const result = await makeTelegramRequest('test-token', 'sendMessage', {
        chat_id: 123,
        text: 'test',
      })
      expect(result.isErr()).toBe(true)
      if (result.isErr())
        expect(result.error).toMatchObject({
          code: 'TELEGRAM_API_RESPONSE_PARSE_ERROR',
          stage,
          status: 502,
          method: 'sendMessage',
        })
    },
  )

  it('retains Telegram refusal details for diagnostics and existing refusal handling', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          ok: false,
          error_code: 429,
          description: 'Too Many Requests: retry after 30',
          parameters: { retry_after: 30 },
        },
        { status: 429 },
      ),
    )
    const result = await makeTelegramRequest('test-token', 'sendMessage', {
      chat_id: 123,
      text: 'test',
    })
    expect(result.isErr()).toBe(true)
    if (result.isErr())
      expect(result.error).toMatchObject({
        code: 'TELEGRAM_API_REQUEST_ERROR',
        stage: 'provider',
        method: 'sendMessage',
        status: 429,
        errorCode: 429,
        message: 'Too Many Requests: retry after 30',
        parameters: { retry_after: 30 },
      })
  })
})
