import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  nameExpiryDefinition,
  nameExpiryNoticeKindFromStage,
} from './name-expiry'

const parse = (payload: unknown) =>
  v.safeParse(nameExpiryDefinition.payloadSchema, payload)

describe('name-expiry payload schema', () => {
  it('parses the current lifecycle payload', () => {
    const parsed = parse({
      name: 'alice.eth',
      expiryDate: 1_700_000_000_000,
      protocol: 'v2',
      stage: 'grace-7d',
      watchReason: 'owned',
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.output).toEqual({
      name: 'alice.eth',
      expiryDate: 1_700_000_000_000,
      protocol: 'v2',
      stage: 'grace-7d',
      watchReason: 'owned',
    })
  })

  it('parses legacy records that only have isOwner + watchReason', () => {
    const parsed = parse({
      name: 'alice.eth',
      expiryDate: 1_700_000_000_000,
      isOwner: true,
      watchReason: 'owned',
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.output.protocol).toBeUndefined()
    expect(parsed.output.stage).toBeUndefined()
    expect(parsed.output.isOwner).toBe(true)
    expect(parsed.output.watchReason).toBe('owned')
  })

  it('rejects unknown stages and protocols', () => {
    expect(
      parse({
        name: 'alice.eth',
        expiryDate: 1,
        protocol: 'v3',
        stage: 'expiry-7d',
        watchReason: 'owned',
      }).success,
    ).toBe(false)

    expect(
      parse({
        name: 'alice.eth',
        expiryDate: 1,
        protocol: 'v2',
        stage: 'expired',
        watchReason: 'owned',
      }).success,
    ).toBe(false)
  })
})

describe('nameExpiryNoticeKindFromStage', () => {
  it('groups stages into user-facing notice kinds', () => {
    expect(nameExpiryNoticeKindFromStage('expiry-30d')).toBe('pre-expiry')
    expect(nameExpiryNoticeKindFromStage('expiry-7d')).toBe('pre-expiry')
    expect(nameExpiryNoticeKindFromStage('expiry-1d')).toBe('pre-expiry')
    expect(nameExpiryNoticeKindFromStage('grace-start')).toBe('grace-start')
    expect(nameExpiryNoticeKindFromStage('grace-7d')).toBe('grace-ending')
    expect(nameExpiryNoticeKindFromStage('grace-1d')).toBe('grace-ending')
    expect(nameExpiryNoticeKindFromStage('premium-start')).toBe('premium-start')
  })
})
