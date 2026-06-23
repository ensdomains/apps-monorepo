import type { Address, Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import { buildBatchedProfileReplayCalls } from './batchProfileReplay'
import type { Profile } from './fetchV1Profiles'

const resolver = '0x000000000000000000000000000000000000beef' as Address
const nodeHex =
  '0x0000000000000000000000000000000000000000000000000000000000000abc' as Hex

const profileOf = (texts: number, addrs: number): Profile => ({
  texts: Array.from({ length: texts }, (_, i) => ({
    key: `key${i}`,
    value: `value${i}`,
  })),
  addresses: Array.from({ length: addrs }, (_, i) => ({
    coinType: BigInt(60 + i),
    value: '0x0000000000000000000000000000000000000000' as Hex,
  })),
})

describe('buildBatchedProfileReplayCalls', () => {
  it('returns [] when no profiles', () => {
    expect(
      buildBatchedProfileReplayCalls({ resolver, profiles: new Map() }),
    ).toEqual([])
  })

  it('emits a single multicall when all inner calls fit', () => {
    const profiles = new Map<Hex, Profile>([[nodeHex, profileOf(2, 1)]])
    const calls = buildBatchedProfileReplayCalls({ resolver, profiles })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.to).toBe(resolver)
  })

  it('splits inner calls across batches when the budget is tight', () => {
    const profiles = new Map<Hex, Profile>([[nodeHex, profileOf(20, 0)]])
    const calls = buildBatchedProfileReplayCalls({
      resolver,
      profiles,
      targetGas: 300_000n,
    })
    expect(calls.length).toBeGreaterThan(1)
    expect(calls.every((c) => c.data.startsWith('0x'))).toBe(true)
  })
})
