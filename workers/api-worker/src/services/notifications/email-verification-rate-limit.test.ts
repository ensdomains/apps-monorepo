import { describe, expect, it } from 'vitest'
import { KV_KEY } from '#core/kv/index.js'
import {
  checkAndConsumeEmailVerificationRateLimit,
  EMAIL_VERIFICATION_RATE_LIMIT_MAX_SENDS,
} from './email-verification-rate-limit.js'

class MockKV {
  readonly store = new Map<string, string>()
  async get(key: string) {
    return this.store.get(key) ?? null
  }
  async put(key: string, value: string) {
    this.store.set(key, value)
  }
}

const asKv = (mock: MockKV) => mock as unknown as KVNamespace

describe('email verification caller limit', () => {
  it('limits one account without consuming another account allowance', async () => {
    const mock = new MockKV()
    const kv = asKv(mock)
    for (let i = 0; i < EMAIL_VERIFICATION_RATE_LIMIT_MAX_SENDS; i++) {
      expect(
        await checkAndConsumeEmailVerificationRateLimit(kv, 'account-a'),
      ).toEqual({ isAllowed: true })
    }
    expect(
      (await checkAndConsumeEmailVerificationRateLimit(kv, 'account-a'))
        .isAllowed,
    ).toBe(false)
    expect(
      await checkAndConsumeEmailVerificationRateLimit(kv, 'account-b'),
    ).toEqual({ isAllowed: true })
    expect(
      mock.store.has(KV_KEY.NOTIFICATIONS.EMAIL_VERIFICATION('account-a')),
    ).toBe(true)
    expect(
      mock.store.has(KV_KEY.NOTIFICATIONS.EMAIL_VERIFICATION('account-b')),
    ).toBe(true)
  })
})
