import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { type ClassifiedName, FUSES, hasFuse, is2LD } from './classifyNames'
import type { V1Domain } from './v1SubgraphClient'

const OWNER: Address = '0x0000000000000000000000000000000000000001'

const make = (tokenType: ClassifiedName['tokenType']): ClassifiedName => ({
  tokenType,
  label: 'x',
  parentName: tokenType === 'unwrapped' ? 'eth' : null,
  fuses: 0,
  tokenHolder: OWNER,
  v1ResolverAddress: null,
  resolverStrategy: 'to-owned-permres',
  managerAddress: null,
  domain: { id: '0x01' } as unknown as V1Domain,
})

describe('FUSES constants', () => {
  it('matches NameWrapper fuse bit layout from MIGRATION_CASE_STUDY.md', () => {
    expect(FUSES.CAN_DO_EVERYTHING).toBe(0)
    expect(FUSES.CANNOT_UNWRAP).toBe(1)
    expect(FUSES.CANNOT_BURN_FUSES).toBe(2)
    expect(FUSES.CANNOT_TRANSFER).toBe(4)
    expect(FUSES.CANNOT_SET_RESOLVER).toBe(8)
    expect(FUSES.CANNOT_SET_TTL).toBe(16)
    expect(FUSES.CANNOT_CREATE_SUBDOMAIN).toBe(32)
    expect(FUSES.CANNOT_APPROVE).toBe(64)
    expect(FUSES.PARENT_CANNOT_CONTROL).toBe(1 << 16)
    expect(FUSES.IS_DOT_ETH).toBe(1 << 17)
    expect(FUSES.CAN_EXTEND_EXPIRY).toBe(1 << 18)
  })

  it('uses non-overlapping bits for each fuse', () => {
    const bits = Object.values(FUSES).filter((v) => v !== 0)
    const or = bits.reduce((acc, b) => acc | b, 0)
    const sum = bits.reduce((acc, b) => acc + b, 0)
    expect(or).toBe(sum)
  })
})

describe('hasFuse', () => {
  it('returns false when the fuse bit is not set', () => {
    expect(hasFuse(0, FUSES.CANNOT_UNWRAP)).toBe(false)
    expect(hasFuse(FUSES.CANNOT_TRANSFER, FUSES.CANNOT_UNWRAP)).toBe(false)
  })

  it('returns true when the fuse bit is set', () => {
    expect(hasFuse(FUSES.CANNOT_UNWRAP, FUSES.CANNOT_UNWRAP)).toBe(true)
  })

  it('isolates a single bit within a combined mask', () => {
    const combined =
      FUSES.CANNOT_UNWRAP | FUSES.CANNOT_TRANSFER | FUSES.CANNOT_APPROVE
    expect(hasFuse(combined, FUSES.CANNOT_TRANSFER)).toBe(true)
    expect(hasFuse(combined, FUSES.CANNOT_SET_RESOLVER)).toBe(false)
  })

  it('works with PARENT_CANNOT_CONTROL (high bit)', () => {
    expect(
      hasFuse(FUSES.PARENT_CANNOT_CONTROL, FUSES.PARENT_CANNOT_CONTROL),
    ).toBe(true)
    expect(hasFuse(FUSES.CANNOT_UNWRAP, FUSES.PARENT_CANNOT_CONTROL)).toBe(
      false,
    )
  })
})

describe('is2LD', () => {
  it('is true for unwrapped, unlocked and locked-2ld', () => {
    expect(is2LD(make('unwrapped'))).toBe(true)
    expect(is2LD(make('unlocked'))).toBe(true)
    expect(is2LD(make('locked-2ld'))).toBe(true)
  })

  it('is false for locked-child and detached-child', () => {
    expect(is2LD(make('locked-child'))).toBe(false)
    expect(is2LD(make('detached-child'))).toBe(false)
  })
})
