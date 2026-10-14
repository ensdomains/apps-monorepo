import { channelDefinitions } from '@ens-apps/shared-schema/notifications'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { getPushRegistrationMetadata } from './push-metadata'

const PUBLIC_KEY =
  'BOBjtfgZPtGSJtajVkh4T1Ceswos_aRXYlD4Mq8aXEa4sc_0lkrwKzUhnUIgCt22_cAEYSr0wZlhCiWPsFXyRGs'

describe('push registration provenance', () => {
  it('records the browser origin and a compact fingerprint of the configured key', async () => {
    expect(
      await getPushRegistrationMetadata('https://app.example:8443', PUBLIC_KEY),
    ).toEqual({
      origin: 'https://app.example:8443',
      // Fixed SHA-256 vector calculated independently from the decoded key.
      vapidKeyId: 'bY2gRNlSdzJMq3vqymOu3Q',
    })
  })

  it('identifies the same key regardless of base64url padding', async () => {
    const unpadded = await getPushRegistrationMetadata(undefined, PUBLIC_KEY)
    const padded = await getPushRegistrationMetadata(
      undefined,
      `${PUBLIC_KEY}=`,
    )

    expect(unpadded.vapidKeyId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(padded.vapidKeyId).toBe(unpadded.vapidKeyId)
  })

  it('distinguishes a different key', async () => {
    const original = await getPushRegistrationMetadata(undefined, PUBLIC_KEY)
    const changed = await getPushRegistrationMetadata(
      undefined,
      `${PUBLIC_KEY.slice(0, -3)}AAA`,
    )

    expect(changed.vapidKeyId).not.toBe(original.vapidKeyId)
  })

  it.each([
    undefined,
    'null',
    'invalid',
    'file:///tmp/example',
  ])('does not invent an origin for %s', async (origin) => {
    expect(await getPushRegistrationMetadata(origin, undefined)).toEqual({
      origin: null,
      vapidKeyId: null,
    })
  })

  it('preserves compatibility with subscriptions registered before metadata existed', () => {
    expect(
      v.safeParse(channelDefinitions.push.dataSchema, {
        auth: 'auth',
        p256dh: 'encryption-key',
        expirationTime: null,
      }).success,
    ).toBe(true)
  })

  it('accepts legacy rows that stored the full public key', () => {
    const parsed = v.parse(channelDefinitions.push.dataSchema, {
      auth: 'auth',
      p256dh: 'encryption-key',
      origin: 'https://app.example',
      vapidPublicKey: PUBLIC_KEY,
    })

    expect(parsed.origin).toBe('https://app.example')
    expect(parsed.vapidKeyId).toBeUndefined()
  })
})
