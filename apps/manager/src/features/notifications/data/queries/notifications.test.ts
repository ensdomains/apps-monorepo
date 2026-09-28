import type { MutationFunctionContext } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/backend-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/backend-client')>()),
  backendClient: { notifications: { read: { $patch: vi.fn() } } },
}))
vi.mock('@/features/notifications/data/selectors', () => ({
  selectValidNotifications: (value: unknown) => value,
}))

import { backendAuthStore, backendClient } from '@/utils/backend-client'
import {
  markNotificationsReadMutationOptions,
  type NotificationIdentifier,
} from './notifications'

const patch = vi.mocked(backendClient.notifications.read.$patch)
const sessionA = { authKey: 'synthetic-session-a', address: '0xabc' }
const items: NotificationIdentifier[] = Array.from(
  { length: 201 },
  (_, index) => ({
    id: `synthetic-broadcast-${index}`,
    source: 'broadcast',
  }),
)
const run = (value = items) => {
  const mutation = markNotificationsReadMutationOptions.mutationFn
  if (!mutation) throw new Error('Missing read mutation')
  return mutation(value, {} as MutationFunctionContext)
}

describe('notification read batch session continuity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    backendAuthStore.trigger.signIn(sessionA)
    patch.mockResolvedValue({ ok: true } as never)
  })
  afterEach(() => backendAuthStore.trigger.signOut())

  it('submits exact IDs in batches of at most 100 within the same login', async () => {
    await expect(run()).resolves.toEqual({ markedCount: 201 })
    expect(patch.mock.calls.map(([arg]) => arg.json.length)).toEqual([
      100, 100, 1,
    ])
    expect(patch.mock.calls.flatMap(([arg]) => arg.json)).toEqual(items)
  })

  it.each([
    'sign out',
    'switch wallet',
    'replace token',
    'restore old login',
  ])('never submits another old batch after %s', async (change) => {
    let complete: (value: Awaited<ReturnType<typeof patch>>) => void = () =>
      undefined
    patch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const pending = run()
    const rejected = expect(pending).rejects.toMatchObject({
      _tag: 'NotificationSessionChangedError',
    })
    expect(patch).toHaveBeenCalledOnce()
    if (change === 'sign out' || change === 'restore old login') {
      backendAuthStore.trigger.signOut()
      if (change === 'restore old login')
        backendAuthStore.trigger.signIn(sessionA)
    } else {
      backendAuthStore.trigger.signIn({
        authKey: 'synthetic-session-b',
        address: change === 'switch wallet' ? '0xdef' : sessionA.address,
      })
    }
    complete({ ok: true } as never)
    await rejected
    expect(patch).toHaveBeenCalledOnce()
  })

  it('requires a login before the first write', async () => {
    backendAuthStore.trigger.signOut()
    await expect(run()).rejects.toMatchObject({
      _tag: 'NotificationSessionChangedError',
    })
    expect(patch).not.toHaveBeenCalled()
  })

  it('stops after an unsuccessful batch', async () => {
    patch.mockResolvedValueOnce({ ok: false, status: 503 } as never)
    await expect(run()).rejects.toThrow(
      'Failed to mark notifications as read: 503',
    )
    expect(patch).toHaveBeenCalledOnce()
  })

  it('does not write an empty selection', async () => {
    await expect(run([])).resolves.toEqual({ markedCount: 0 })
    expect(patch).not.toHaveBeenCalled()
  })
})
