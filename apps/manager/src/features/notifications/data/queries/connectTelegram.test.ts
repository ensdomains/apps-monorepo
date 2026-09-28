import type { MutationFunctionContext } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/backend-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/backend-client')>()),
  backendClient: {
    notifications: { channels: { telegram: { $post: vi.fn() } } },
  },
}))
vi.mock('@/features/notifications/utils/telegram/auth', () => ({
  loginWithTelegramPopup: vi.fn(),
}))

import { loginWithTelegramPopup } from '@/features/notifications/utils/telegram/auth'
import { backendAuthStore, backendClient } from '@/utils/backend-client'
import { connectTelegramChannelMutationOptions } from './connectTelegram'

const authData = {
  id: 123,
  first_name: 'Tester',
  username: 'test-account',
  auth_date: 1,
  hash: 'synthetic-telegram-hash',
}
const popup = vi.mocked(loginWithTelegramPopup)
const post = vi.mocked(backendClient.notifications.channels.telegram.$post)
const sessionA = { authKey: 'session-a', address: '0xabc' }
const run = () => {
  const mutationFn = connectTelegramChannelMutationOptions.mutationFn
  if (!mutationFn) throw new Error('Missing mutationFn')
  return mutationFn(undefined, {} as MutationFunctionContext)
}

describe('Telegram connection session continuity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    backendAuthStore.trigger.signIn(sessionA)
    post.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'telegram-channel' }),
    } as never)
  })
  afterEach(() => backendAuthStore.trigger.signOut())

  it('posts the exact popup result when the initiating session is still active', async () => {
    popup.mockResolvedValue(authData)
    await expect(run()).resolves.toEqual({ id: 'telegram-channel' })
    expect(post).toHaveBeenCalledExactlyOnceWith({
      json: { auth_data: authData },
    })
  })

  it.each([
    'sign out',
    'switch wallet',
    'replace token',
    'restore old login',
  ])('rejects completion after %s while the popup is pending', async (change) => {
    let finishPopup: (value: typeof authData) => void = () => undefined
    popup.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPopup = resolve
        }),
    )
    const pending = run()
    const rejected = expect(pending).rejects.toMatchObject({
      _tag: 'NotificationSessionChangedError',
    })
    expect(popup).toHaveBeenCalledOnce()
    if (change === 'sign out' || change === 'restore old login') {
      backendAuthStore.trigger.signOut()
      if (change === 'restore old login')
        backendAuthStore.trigger.signIn(sessionA)
    } else {
      backendAuthStore.trigger.signIn({
        authKey: 'session-b',
        address: change === 'switch wallet' ? '0xdef' : sessionA.address,
      })
    }
    finishPopup(authData)
    await rejected
    expect(post).not.toHaveBeenCalled()
  })

  it('requires a login before opening a popup', async () => {
    backendAuthStore.trigger.signOut()
    await expect(run()).rejects.toMatchObject({
      _tag: 'NotificationSessionChangedError',
    })
    expect(popup).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('does not post when the popup is cancelled', async () => {
    popup.mockRejectedValue(new Error('Popup closed'))
    await expect(run()).rejects.toThrow('Popup closed')
    expect(post).not.toHaveBeenCalled()
  })
})
