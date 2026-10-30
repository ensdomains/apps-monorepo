import { afterEach, describe, expect, it, vi } from 'vitest'
import { backendClient } from '@/utils/backend-client'
import {
  cancelTelegramLogin,
  getTelegramLoginPhase,
  getTelegramLoginStatus,
  startTelegramLogin,
  telegramPollInterval,
} from './login'

vi.mock('@/utils/backend-client', () => ({
  backendClient: {
    notifications: {
      channels: {
        telegram: {
          oauth: { $post: vi.fn(), $get: vi.fn(), ':id': { $delete: vi.fn() } },
        },
      },
    },
  },
}))

const attempt = () => ({
  id: 'attempt-id',
  status: 'pending' as const,
  expires_at: new Date(Date.now() + 600_000).toISOString(),
})
const result = () => ({
  ...attempt(),
  authorizationUrl: 'https://oauth.telegram.org/auth?state=random',
})

describe('Telegram new-tab login', () => {
  afterEach(() => vi.restoreAllMocks())

  it('initiates through the authenticated client without opening or changing a tab', async () => {
    const open = vi.spyOn(window, 'open')
    vi.mocked(
      backendClient.notifications.channels.telegram.oauth.$post,
    ).mockImplementation(async () => Response.json(result()) as never)
    const originalUrl = window.location.href
    expect(
      (await startTelegramLogin())._unsafeUnwrap().authorizationUrl,
    ).toContain('oauth.telegram.org')
    expect(open).not.toHaveBeenCalled()
    expect(window.location.href).toBe(originalUrl)
  })

  it('returns typed request failures without opening a tab', async () => {
    const cause = new Error('offline')
    vi.mocked(
      backendClient.notifications.channels.telegram.oauth.$post,
    ).mockRejectedValueOnce(cause)
    expect((await startTelegramLogin())._unsafeUnwrapErr()).toMatchObject({
      _tag: 'TelegramLoginRequestError',
      operation: 'initiate',
      cause,
    })
  })

  it('preserves the HTTP status when an error response is not JSON', async () => {
    vi.mocked(
      backendClient.notifications.channels.telegram.oauth.$post,
    ).mockResolvedValueOnce(
      new Response('Bad Gateway', { status: 502 }) as never,
    )
    expect((await startTelegramLogin())._unsafeUnwrapErr()).toMatchObject({
      _tag: 'TelegramLoginRequestError',
      operation: 'initiate',
      status: 502,
      message: 'Could not start Telegram login. Please try again.',
    })
  })

  it('validates status responses and accepts cancellation without a response body', async () => {
    const oauth = backendClient.notifications.channels.telegram.oauth
    vi.mocked(oauth.$get).mockResolvedValueOnce(Response.json(null) as never)
    expect(
      (
        await getTelegramLoginStatus(new AbortController().signal)
      )._unsafeUnwrapErr(),
    ).toMatchObject({
      _tag: 'TelegramLoginRequestError',
      operation: 'status',
      status: 200,
    })
    vi.mocked(oauth[':id'].$delete).mockResolvedValueOnce(
      new Response(null, { status: 204 }) as never,
    )
    expect(
      (await cancelTelegramLogin('attempt-id'))._unsafeUnwrap(),
    ).toBeUndefined()
  })

  it.each([
    null,
    {},
    { id: 'attempt', authorizationUrl: 'not a URL', expires_at: 'invalid' },
  ])(
    'returns a typed error for a malformed success response: %j',
    async (body) => {
      vi.mocked(
        backendClient.notifications.channels.telegram.oauth.$post,
      ).mockResolvedValueOnce(Response.json(body) as never)
      expect((await startTelegramLogin())._unsafeUnwrapErr()).toMatchObject({
        _tag: 'TelegramLoginRequestError',
        operation: 'initiate',
      })
    },
  )

  it('bounds polling to the server deadline and stops for every terminal status', () => {
    expect(getTelegramLoginPhase(attempt())).toBe('pending')
    expect(telegramPollInterval(attempt())).toBe(5_000)
    for (const status of [
      'completed',
      'cancelled',
      'failed',
      'expired',
    ] as const) {
      expect(telegramPollInterval({ ...attempt(), status })).toBe(false)
    }
    expect(
      telegramPollInterval({
        ...attempt(),
        expires_at: new Date(Date.now() - 1).toISOString(),
      }),
    ).toBe(false)
    expect(telegramPollInterval(null)).toBe(false)
  })
})
