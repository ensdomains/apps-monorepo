import { describe, expect, it } from 'vitest'
import { makeClassified } from './_fixtures'
import { FUSES, hasFuse, is2LD } from './classifyNames'

describe('FUSES constants', () => {
  it('matches NameWrapper fuse bit layout', () => {
    expect({ ...FUSES }).toEqual({
      CAN_DO_EVERYTHING: 0,
      CANNOT_UNWRAP: 1,
      CANNOT_BURN_FUSES: 2,
      CANNOT_TRANSFER: 4,
      CANNOT_SET_RESOLVER: 8,
      CANNOT_SET_TTL: 16,
      CANNOT_CREATE_SUBDOMAIN: 32,
      CANNOT_APPROVE: 64,
      PARENT_CANNOT_CONTROL: 1 << 16,
      IS_DOT_ETH: 1 << 17,
      CAN_EXTEND_EXPIRY: 1 << 18,
    })
  })

  it('uses non-overlapping bits for each fuse', () => {
    const bits = Object.values(FUSES).filter((v) => v !== 0)
    expect(bits.reduce((a, b) => a | b, 0)).toBe(
      bits.reduce((a, b) => a + b, 0),
    )
  })
})

describe('hasFuse', () => {
  it.each([
    [0, FUSES.CANNOT_UNWRAP, false],
    [FUSES.CANNOT_TRANSFER, FUSES.CANNOT_UNWRAP, false],
    [FUSES.CANNOT_UNWRAP, FUSES.CANNOT_UNWRAP, true],
    [
      FUSES.CANNOT_UNWRAP | FUSES.CANNOT_TRANSFER | FUSES.CANNOT_APPROVE,
      FUSES.CANNOT_TRANSFER,
      true,
    ],
    [
      FUSES.CANNOT_UNWRAP | FUSES.CANNOT_TRANSFER | FUSES.CANNOT_APPROVE,
      FUSES.CANNOT_SET_RESOLVER,
      false,
    ],
    [FUSES.PARENT_CANNOT_CONTROL, FUSES.PARENT_CANNOT_CONTROL, true],
    [FUSES.CANNOT_UNWRAP, FUSES.PARENT_CANNOT_CONTROL, false],
  ])('hasFuse(%i, %i) === %s', (fuses, fuse, expected) => {
    expect(hasFuse(fuses, fuse)).toBe(expected)
  })
})

describe('is2LD', () => {
  it.each([
    ['unwrapped', true],
    ['unlocked', true],
    ['locked-2ld', true],
    ['locked-child', false],
    ['detached-child', false],
  ] as const)('%s → %s', (tokenType, expected) => {
    expect(is2LD(makeClassified({ tokenType, parentName: null }))).toBe(
      expected,
    )
  })
})
