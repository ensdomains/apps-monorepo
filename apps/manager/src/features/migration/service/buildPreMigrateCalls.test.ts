import type { Address } from 'viem'
import { decodeFunctionData, parseAbiItem } from 'viem'
import { describe, expect, it } from 'vitest'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { buildPreMigrateCall } from './buildPreMigrateCalls'
import type { ClassifiedName } from './classifyNames'
import type { V1Domain } from './v1SubgraphClient'

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const CUSTOM_RESOLVER = '0x00000000000000000000000000000000deadbeef'

const preMigrateFn = parseAbiItem(
  'function preMigrate(string label, uint64 expiry, address registry, address resolver)',
)

const makeClassified = (overrides: {
  label: string
  v1ResolverAddress?: string | null
  registrationExpiry?: string
  wrappedExpiry?: string
}): ClassifiedName =>
  ({
    tokenType: 'unwrapped',
    label: overrides.label,
    parentName: 'eth',
    fuses: 0,
    tokenHolder: OWNER,
    v1ResolverAddress: overrides.v1ResolverAddress ?? null,
    resolverStrategy: 'to-owned-permres',
    managerAddress: null,
    domain: {
      id: `0x${overrides.label}`,
      name: `${overrides.label}.eth`,
      registration: overrides.registrationExpiry
        ? { expiryDate: overrides.registrationExpiry }
        : null,
      wrappedDomain: overrides.wrappedExpiry
        ? { expiryDate: overrides.wrappedExpiry }
        : null,
    } as unknown as V1Domain,
  }) as ClassifiedName

describe('buildPreMigrateCall', () => {
  it('targets the PreMigrationController with encoded preMigrate calldata', () => {
    const call = buildPreMigrateCall(
      makeClassified({
        label: 'alice',
        v1ResolverAddress: CUSTOM_RESOLVER,
        registrationExpiry: '100',
      }),
    )
    expect(call.to).toBe(V2_CONTRACTS.PreMigrationController)
    expect(call.value).toBe(0n)

    const decoded = decodeFunctionData({ abi: [preMigrateFn], data: call.data })
    expect(decoded.args[0]).toBe('alice')
    expect(decoded.args[1]).toBe(100n)
    expect(decoded.args[2].toLowerCase()).toBe(
      V1_CONTRACTS.ENSRegistry.toLowerCase(),
    )
    expect(decoded.args[3].toLowerCase()).toBe(CUSTOM_RESOLVER.toLowerCase())
  })

  it('prefers wrappedDomain expiry over registration', () => {
    const call = buildPreMigrateCall(
      makeClassified({
        label: 'alice',
        registrationExpiry: '100',
        wrappedExpiry: '200',
      }),
    )
    const decoded = decodeFunctionData({ abi: [preMigrateFn], data: call.data })
    expect(decoded.args[1]).toBe(200n)
  })

  it('falls back to registration expiry when wrapped is absent', () => {
    const call = buildPreMigrateCall(
      makeClassified({ label: 'alice', registrationExpiry: '300' }),
    )
    const decoded = decodeFunctionData({ abi: [preMigrateFn], data: call.data })
    expect(decoded.args[1]).toBe(300n)
  })

  it('falls back to the v1 PublicResolver when v1ResolverAddress is null', () => {
    const call = buildPreMigrateCall(
      makeClassified({ label: 'alice', registrationExpiry: '1' }),
    )
    const decoded = decodeFunctionData({ abi: [preMigrateFn], data: call.data })
    expect(decoded.args[3].toLowerCase()).toBe(
      V1_CONTRACTS.PublicResolver.toLowerCase(),
    )
  })

  it('throws with a specific message including the domain name when neither expiry is available', () => {
    expect(() =>
      buildPreMigrateCall(makeClassified({ label: 'alice' })),
    ).toThrow(/No expiry found for alice\.eth/)
  })
})
