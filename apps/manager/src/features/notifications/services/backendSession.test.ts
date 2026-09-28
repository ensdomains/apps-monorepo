import { errAsync, okAsync } from 'neverthrow'
import { afterEach, describe, expect, it } from 'vitest'
import { backendAuthStore } from '@/utils/backend-client'
import {
  type captureNotificationSession,
  withNotificationSession,
} from './backendSession'

describe('notification session listener cleanup', () => {
  afterEach(() => backendAuthStore.trigger.signOut())

  it.each([
    'success',
    'error',
  ])('releases the auth listener after a Result %s', async (outcome) => {
    const login = { authKey: 'session-a', address: '0xabc' }
    backendAuthStore.trigger.signIn(login)
    let captured: ReturnType<typeof captureNotificationSession> | undefined
    await withNotificationSession((session) => {
      captured = session
      return outcome === 'success'
        ? okAsync<string, string>('done')
        : errAsync<string, string>('failed')
    })
    // A disposed guard no longer observes transient changes. An unfinished
    // guard does observe them, as the deferred popup tests verify.
    backendAuthStore.trigger.signOut()
    backendAuthStore.trigger.signIn(login)
    expect(captured?.validate().isOk()).toBe(true)
  })
})
