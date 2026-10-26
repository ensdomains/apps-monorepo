import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TelegramAttempt } from '@/features/notifications/utils/telegram/login'
import { backendAuthStore } from '@/utils/backend-client'
import { useTelegramLogin } from './useTelegramLogin'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), cancel: vi.fn() }))
vi.mock('@/utils/backend-client', async (original) => ({
  ...(await original<typeof import('@/utils/backend-client')>()),
  backendClient: {
    notifications: {
      channels: {
        telegram: {
          oauth: {
            $get: api.get,
            $post: api.post,
            ':id': { $delete: api.cancel },
          },
        },
      },
    },
  },
}))

describe('shared Telegram login lifecycle', () => {
  let client: QueryClient
  let attempt: TelegramAttempt | null
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    attempt = {
      id: 'attempt',
      status: 'pending',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    }
    api.get
      .mockReset()
      .mockImplementation(async () => Response.json({ attempt }))
    api.post.mockReset().mockImplementation(async () =>
      Response.json({
        ...attempt,
        authorizationUrl: 'https://oauth.telegram.org/auth?state=test',
      }),
    )
    api.cancel.mockReset().mockImplementation(async () => {
      if (attempt) attempt = { ...attempt, status: 'cancelled' }
      return Response.json({ ok: true })
    })
    backendAuthStore.trigger.signIn({
      address: '0x123',
      authKey: 'test-bearer',
    })
  })
  afterEach(() => {
    client.clear()
    backendAuthStore.trigger.signOut()
    focusManager.setFocused(undefined)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('recovers pending status after remount without browser storage or an opener', async () => {
    const first = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(first.result.current.isPending).toBe(true))
    first.unmount()
    const second = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(second.result.current.isPending).toBe(true))
    expect(second.result.current.authorizationUrl).toBeUndefined()
    second.unmount()
  })

  it('refetches on focus and refreshes channels after the server completes authentication', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(hook.result.current.isPending).toBe(true))
    attempt = attempt && { ...attempt, status: 'completed' }
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await waitFor(() =>
      expect(hook.result.current.attempt?.status).toBe('completed'),
    )
    expect(hook.result.current.isPending).toBe(false)
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: qk('channels', 'list'),
    })
    hook.unmount()
  })

  it('cancels through the authenticated endpoint and releases pending UI', async () => {
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(hook.result.current.isPending).toBe(true))
    act(() => hook.result.current.cancel())
    await waitFor(() =>
      expect(hook.result.current.attempt?.status).toBe('cancelled'),
    )
    expect(api.cancel).toHaveBeenCalledWith(
      { param: { id: 'attempt' } },
      expect.objectContaining({ init: expect.any(Object) }),
    )
    expect(hook.result.current.isPending).toBe(false)
    hook.unmount()
  })

  it('opens the real URL after initiation while keeping an explicit fallback available', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'desktop',
      userActivation: { isActive: true },
    })
    attempt = null
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    api.post.mockImplementation(async () => {
      expect(open).not.toHaveBeenCalled()
      return Response.json({
        id: 'new-attempt',
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        authorizationUrl: 'https://oauth.telegram.org/auth?state=test',
      })
    })
    act(() => hook.result.current.connect())
    await waitFor(() =>
      expect(hook.result.current.authorizationUrl).toContain(
        'oauth.telegram.org',
      ),
    )
    expect(open).toHaveBeenCalledWith(
      'https://oauth.telegram.org/auth?state=test',
      '_blank',
      'noopener,noreferrer',
    )
    expect(hook.result.current.isPending).toBe(true)
    hook.unmount()
  })

  it.each([
    ['iPhone WebView MetaMaskMobile', 'safari'],
    ['Android Mobile MetaMaskMobile', 'copy-link'],
  ] as const)(
    'keeps a pending link without automatic opening for %s',
    async (userAgent, strategy) => {
      vi.stubGlobal('navigator', {
        userAgent,
        userActivation: { isActive: true },
      })
      const open = vi.spyOn(window, 'open')
      const hook = renderHook(useTelegramLogin, { wrapper })
      await waitFor(() => expect(hook.result.current.isPending).toBe(true))
      act(() => hook.result.current.connect())
      await waitFor(() =>
        expect(hook.result.current.authorizationUrl).toContain(
          'oauth.telegram.org',
        ),
      )
      expect(hook.result.current.openingStrategy).toBe(strategy)
      expect(open).not.toHaveBeenCalled()
      hook.unmount()
    },
  )

  it('expires locally and clears timers after unmount even when the network is unavailable', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    attempt = attempt && {
      ...attempt,
      expires_at: new Date(Date.now() + 200).toISOString(),
    }
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(hook.result.current.isPending).toBe(true))
    api.get.mockRejectedValue(new Error('offline'))
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(hook.result.current.isPending).toBe(false)
    expect(hook.result.current.isExpired).toBe(true)
    hook.unmount()
    const calls = api.get.mock.calls.length
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(api.get).toHaveBeenCalledTimes(calls)
  })

  it('isolates pending status when the authenticated wallet changes', async () => {
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(hook.result.current.isPending).toBe(true))
    attempt = null
    act(() =>
      backendAuthStore.trigger.signIn({
        address: '0x456',
        authKey: 'second-user-bearer',
      }),
    )
    await waitFor(() => expect(hook.result.current.attempt).toBeNull())
    expect(hook.result.current.isPending).toBe(false)
    expect(hook.result.current.authorizationUrl).toBeUndefined()
    hook.unmount()
  })

  it('does not lose a new attempt when an older status request finishes late', async () => {
    let finishStatus: ((response: Response) => void) | undefined
    api.get.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishStatus = resolve
        }),
    )
    vi.spyOn(window, 'open').mockReturnValue(null)
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(finishStatus).toBeDefined())
    act(() => hook.result.current.connect())
    await waitFor(() => expect(hook.result.current.isPending).toBe(true))
    await act(async () => {
      finishStatus?.(Response.json({ attempt: null }))
    })
    expect(hook.result.current.isPending).toBe(true)
    hook.unmount()
  })

  it('shows cancellation and status errors independently and clears cancellation errors after completion', async () => {
    api.cancel.mockRejectedValueOnce(new Error('cancel failed'))
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(hook.result.current.isPending).toBe(true))
    act(() => hook.result.current.cancel())
    await waitFor(() => expect(hook.result.current.cancelError).toBeTruthy())

    api.get.mockRejectedValueOnce(new Error('status failed'))
    await act(() =>
      client.invalidateQueries({ queryKey: qk('telegram_login', 'current') }),
    )
    await waitFor(() => expect(hook.result.current.statusError).toBeTruthy())
    expect(hook.result.current.cancelError).toBeTruthy()

    attempt = attempt && { ...attempt, status: 'completed' }
    await act(() =>
      client.invalidateQueries({ queryKey: qk('telegram_login', 'current') }),
    )
    await waitFor(() =>
      expect(hook.result.current.attempt?.status).toBe('completed'),
    )
    expect(hook.result.current.cancelError).toBeNull()
    expect(hook.result.current.statusError).toBeNull()
    hook.unmount()
  })

  it('does not carry a local expiry into a new attempt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    attempt = attempt && {
      ...attempt,
      expires_at: new Date(Date.now() + 200).toISOString(),
    }
    vi.spyOn(window, 'open').mockReturnValue(null)
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(hook.result.current.isPending).toBe(true))
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(hook.result.current.isExpired).toBe(true)

    attempt = {
      id: 'replacement',
      status: 'pending',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    }
    act(() => hook.result.current.connect())
    await waitFor(() =>
      expect(hook.result.current.attempt?.id).toBe('replacement'),
    )
    expect(hook.result.current.isPending).toBe(true)
    expect(hook.result.current.isExpired).toBe(false)
    hook.unmount()
  })
})
