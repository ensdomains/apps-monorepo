import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  nameExpiryDefinition,
  nameExpiryNoticeKindFromStage,
} from './name-expiry'

describe('name-expiry notification contract', () => {
  it('accepts every lifecycle stage and maps it to a notice kind', () => {
    const stages = [
      'expiry-30d',
      'expiry-7d',
      'expiry-1d',
      'grace-start',
      'grace-7d',
      'grace-1d',
      'premium-start',
      'expired',
    ] as const
    expect(stages.map(nameExpiryNoticeKindFromStage)).toEqual([
      'pre-expiry',
      'pre-expiry',
      'pre-expiry',
      'grace-start',
      'grace-ending',
      'grace-ending',
      'premium-start',
      'expired',
    ])
  })

  it('keeps stage optional for stored beta notifications', () => {
    expect(
      v.safeParse(nameExpiryDefinition.payloadSchema, {
        name: 'alice.eth',
        expiryDate: 1,
        isOwner: true,
        watchReason: 'owned',
      }).success,
    ).toBe(true)
  })
})
