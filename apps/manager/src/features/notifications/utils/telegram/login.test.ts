import { afterEach, describe, expect, it, vi } from 'vitest'
import { backendClient } from '@/utils/backend-client'
import {
  cancelTelegramLogin,
  getTelegramLoginPhase,
  getTelegramLoginStatus,
  openTelegramTab,
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

  it('opens an unsized tab synchronously and removes its opener', () => {
    const tab = {
      opener: window,
      document: document.implementation.createHTMLDocument(),
    } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(tab)
    expect(openTelegramTab()).toBe(tab)
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(tab.opener).toBeNull()
    expect(tab.document.querySelector('h1')?.textContent).toBe(
      'Connecting Telegram…',
    )
    expect(tab.document.body.textContent).toContain('original tab')
    expect(tab.document.querySelector('script, iframe, img, link')).toBeNull()
    expect(
      backendClient.notifications.channels.telegram.oauth.$post,
    ).not.toHaveBeenCalled()
  })

  it('retains a usable URL when the tab is blocked or already closed', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openTelegramTab()).toBeNull()
    vi.mocked(
      backendClient.notifications.channels.telegram.oauth.$post,
    ).mockImplementation(async () => Response.json(result()) as never)
    expect(
      (await startTelegramLogin(null))._unsafeUnwrap().authorizationUrl,
    ).toContain('oauth.telegram.org')
    const tab = {
      closed: true,
      location: { replace: vi.fn() },
    } as unknown as Window
    await startTelegramLogin(tab)
    expect(tab.location.replace).not.toHaveBeenCalled()
  })

  it('does not treat embedded-browser navigation errors as failed authentication', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => {
      throw new Error('unsupported')
    })
    expect(openTelegramTab()).toBeNull()
    vi.mocked(
      backendClient.notifications.channels.telegram.oauth.$post,
    ).mockImplementation(async () => Response.json(result()) as never)
    const tab = {
      closed: false,
      location: {
        replace: vi.fn(() => {
          throw new Error('blocked')
        }),
      },
    } as unknown as Window
    expect(
      (await startTelegramLogin(tab))._unsafeUnwrap().authorizationUrl,
    ).toContain('oauth.telegram.org')
  })

  it('navigates only the placeholder tab after initiating through the authenticated client', async () => {
    vi.mocked(
      backendClient.notifications.channels.telegram.oauth.$post,
    ).mockImplementation(async () => Response.json(result()) as never)
    const tab = {
      closed: false,
      location: { replace: vi.fn() },
    } as unknown as Window
    const originalUrl = window.location.href
    const response = (await startTelegramLogin(tab))._unsafeUnwrap()
    expect(tab.location.replace).toHaveBeenCalledWith(response.authorizationUrl)
    expect(window.location.href).toBe(originalUrl)
  })

  it('closes the placeholder on initiation rejection', async () => {
    vi.mocked(
      backendClient.notifications.channels.telegram.oauth.$post,
    ).mockResolvedValue(
      Response.json({ error: 'Please wait' }, { status: 429 }) as never,
    )
    const tab = { close: vi.fn() } as unknown as Window
    expect((await startTelegramLogin(tab))._unsafeUnwrapErr()).toMatchObject({
      _tag: 'TelegramLoginRequestError',
      message: 'Please wait',
      status: 429,
    })
    expect(tab.close).toHaveBeenCalledOnce()
  })

  it('returns typed request failures and closes the placeholder', async () => {
    const cause = new Error('offline')
    vi.mocked(
      backendClient.notifications.channels.telegram.oauth.$post,
    ).mockRejectedValueOnce(cause)
    const tab = { close: vi.fn() } as unknown as Window
    expect((await startTelegramLogin(tab))._unsafeUnwrapErr()).toMatchObject({
      _tag: 'TelegramLoginRequestError',
      operation: 'initiate',
      cause,
    })
    expect(tab.close).toHaveBeenCalledOnce()
  })

  it('preserves the HTTP status when an error response is not JSON', async () => {
    vi.mocked(
      backendClient.notifications.channels.telegram.oauth.$post,
    ).mockResolvedValueOnce(
      new Response('Bad Gateway', { status: 502 }) as never,
    )
    expect((await startTelegramLogin(null))._unsafeUnwrapErr()).toMatchObject({
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
      expect((await startTelegramLogin(null))._unsafeUnwrapErr()).toMatchObject(
        {
          _tag: 'TelegramLoginRequestError',
          operation: 'initiate',
        },
      )
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
