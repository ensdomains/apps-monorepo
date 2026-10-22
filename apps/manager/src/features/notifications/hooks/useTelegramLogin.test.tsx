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
    vi.useRealTimers()
  })

  it('recovers pending status after remount without browser storage or an opener', async () => {
    const first = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(first.result.current.pending).toBe(true))
    first.unmount()
    const second = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(second.result.current.pending).toBe(true))
    expect(second.result.current.authorizationUrl).toBeUndefined()
    second.unmount()
  })

  it('refetches on focus and refreshes channels after the server completes authentication', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(hook.result.current.pending).toBe(true))
    attempt = attempt && { ...attempt, status: 'completed' }
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await waitFor(() =>
      expect(hook.result.current.attempt?.status).toBe('completed'),
    )
    expect(hook.result.current.pending).toBe(false)
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: qk('channels', 'list'),
    })
    hook.unmount()
  })

  it('cancels through the authenticated endpoint and releases pending UI', async () => {
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(hook.result.current.pending).toBe(true))
    act(() => hook.result.current.cancel())
    await waitFor(() =>
      expect(hook.result.current.attempt?.status).toBe('cancelled'),
    )
    expect(api.cancel).toHaveBeenCalledWith(
      { param: { id: 'attempt' } },
      expect.objectContaining({ init: expect.any(Object) }),
    )
    expect(hook.result.current.pending).toBe(false)
    hook.unmount()
  })

  it('opens the placeholder before the initiation request and provides a fallback URL', async () => {
    attempt = null
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    api.post.mockImplementation(async () => {
      expect(open).toHaveBeenCalledOnce()
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
    expect(hook.result.current.pending).toBe(true)
    hook.unmount()
  })

  it('expires locally and clears timers after unmount even when the network is unavailable', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    attempt = attempt && {
      ...attempt,
      expires_at: new Date(Date.now() + 200).toISOString(),
    }
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(hook.result.current.pending).toBe(true))
    api.get.mockRejectedValue(new Error('offline'))
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(hook.result.current.pending).toBe(false)
    expect(hook.result.current.expired).toBe(true)
    hook.unmount()
    const calls = api.get.mock.calls.length
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(api.get).toHaveBeenCalledTimes(calls)
  })

  it('isolates pending status when the authenticated wallet changes', async () => {
    const hook = renderHook(useTelegramLogin, { wrapper })
    await waitFor(() => expect(hook.result.current.pending).toBe(true))
    attempt = null
    act(() =>
      backendAuthStore.trigger.signIn({
        address: '0x456',
        authKey: 'second-user-bearer',
      }),
    )
    await waitFor(() => expect(hook.result.current.attempt).toBeNull())
    expect(hook.result.current.pending).toBe(false)
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
    await waitFor(() => expect(hook.result.current.pending).toBe(true))
    await act(async () => {
      finishStatus?.(Response.json({ attempt: null }))
    })
    expect(hook.result.current.pending).toBe(true)
    hook.unmount()
  })
})
