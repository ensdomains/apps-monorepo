import { describe, expect, it } from 'vitest'
import { pushTemplates } from './push'

describe('pushTemplates', () => {
  it('uses relative Manager paths for notification destinations', () => {
    const expiry = pushTemplates['name-expiry']({
      name: 'helgesson.eth',
      expiryDate: Date.now() + 86_400_000,
      isOwner: true,
      watchReason: 'owned',
      stage: 'expiry-1d',
    })
    const transferred = pushTemplates['name-transferred']({
      name: 'helgesson.eth',
      txHash: '0xabc',
      to: '0x1234567890abcdef1234567890abcdef12345678',
    })

    expect(expiry.data?.url).toBe('/renew/helgesson.eth')
    expect(transferred.data?.url).toBe('/helgesson.eth')
  })
})
