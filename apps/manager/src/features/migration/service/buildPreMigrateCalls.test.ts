import { type Address, decodeFunctionData, parseAbiItem } from 'viem'
import { describe, expect, it } from 'vitest'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified } from './_fixtures'
import { buildPreMigrateCall } from './buildPreMigrateCalls'
import type { ClassifiedName } from './classifyNames'
import type { V1Domain } from './v1SubgraphClient'

const CUSTOM_RESOLVER = '0x00000000000000000000000000000000deadbeef'

const batchRegisterFn = parseAbiItem(
  'function batchRegister(address registry, address resolver, string[] labels, uint64[] expires)',
)

const make = (opts: {
  label: string
  v1ResolverAddress?: string | null
  registrationExpiry?: string
  wrappedExpiry?: string
}): ClassifiedName => {
  const base = makeClassified({
    label: opts.label,
    v1ResolverAddress: opts.v1ResolverAddress ?? null,
    name: `${opts.label}.eth`,
  })
  return {
    ...base,
    domain: {
      ...(base.domain as unknown as V1Domain),
      id: `0x${opts.label}`,
      registration: opts.registrationExpiry
        ? { expiryDate: opts.registrationExpiry }
        : null,
      wrappedDomain: opts.wrappedExpiry
        ? { expiryDate: opts.wrappedExpiry }
        : null,
    } as unknown as V1Domain,
  }
}

const decodeArgs = (data: `0x${string}`) =>
  decodeFunctionData({ abi: [batchRegisterFn], data }).args

describe('buildPreMigrateCall', () => {
  it('targets the BatchRegistrar with encoded batchRegister calldata', () => {
    const call = buildPreMigrateCall(
      make({
        label: 'alice',
        v1ResolverAddress: CUSTOM_RESOLVER,
        registrationExpiry: '100',
      }),
    )
    expect(call.to).toBe(V2_CONTRACTS.BatchRegistrar)
    expect(call.value).toBe(0n)
    const args = decodeArgs(call.data)
    expect((args[0] as Address).toLowerCase()).toBe(
      V1_CONTRACTS.ENSRegistry.toLowerCase(),
    )
    expect((args[1] as Address).toLowerCase()).toBe(
      CUSTOM_RESOLVER.toLowerCase(),
    )
    expect(args[2]).toEqual(['alice'])
    expect(args[3]).toEqual([100n])
  })

  it.each([
    [
      'wrapped over registration',
      { registrationExpiry: '100', wrappedExpiry: '200' },
      200n,
    ],
    [
      'registration when wrapped is absent',
      { registrationExpiry: '300' },
      300n,
    ],
  ])('prefers %s', (_, overrides, expected) => {
    const call = buildPreMigrateCall(make({ label: 'alice', ...overrides }))
    expect(decodeArgs(call.data)[3]).toEqual([expected])
  })

  it('falls back to the v1 PublicResolver when v1ResolverAddress is null', () => {
    const call = buildPreMigrateCall(
      make({ label: 'alice', registrationExpiry: '1' }),
    )
    expect((decodeArgs(call.data)[1] as Address).toLowerCase()).toBe(
      V1_CONTRACTS.PublicResolver.toLowerCase(),
    )
  })

  it('throws with the domain name when neither expiry is available', () => {
    expect(() => buildPreMigrateCall(make({ label: 'alice' }))).toThrow(
      /No expiry found for alice\.eth/,
    )
  })
})
