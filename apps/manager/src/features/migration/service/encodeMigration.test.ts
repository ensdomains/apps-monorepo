import { type Address, decodeAbiParameters, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  createMigrationData,
  encodeMigrationData,
  type MigrationData,
} from './encodeMigration'

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const RESOLVER: Address = '0x0000000000000000000000000000000000000002'
const SUBREGISTRY: Address = '0x0000000000000000000000000000000000000003'

const TUPLE = [
  {
    type: 'tuple',
    components: [
      { name: 'label', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'subregistry', type: 'address' },
      { name: 'resolver', type: 'address' },
    ],
  },
] as const

const decode = (encoded: `0x${string}`): MigrationData =>
  decodeAbiParameters(TUPLE, encoded)[0] as MigrationData

describe('createMigrationData', () => {
  it('defaults subregistry to zeroAddress when not provided', () => {
    expect(
      createMigrationData({ label: 'alice', owner: OWNER, resolver: RESOLVER }),
    ).toEqual({
      label: 'alice',
      owner: OWNER,
      subregistry: zeroAddress,
      resolver: RESOLVER,
    })
  })

  it('uses provided subregistry when given', () => {
    expect(
      createMigrationData({
        label: 'alice',
        owner: OWNER,
        resolver: RESOLVER,
        subregistry: SUBREGISTRY,
      }).subregistry,
    ).toBe(SUBREGISTRY)
  })
})

describe('encodeMigrationData', () => {
  it('round-trips via decodeAbiParameters', () => {
    const input: MigrationData = {
      label: 'alice',
      owner: OWNER,
      subregistry: SUBREGISTRY,
      resolver: RESOLVER,
    }
    const decoded = decode(encodeMigrationData(input))
    expect(decoded.label).toBe(input.label)
    expect(decoded.owner.toLowerCase()).toBe(OWNER.toLowerCase())
    expect(decoded.subregistry.toLowerCase()).toBe(SUBREGISTRY.toLowerCase())
    expect(decoded.resolver.toLowerCase()).toBe(RESOLVER.toLowerCase())
  })

  it('produces distinct output for distinct labels and subregistries', () => {
    const base = {
      owner: OWNER,
      subregistry: zeroAddress,
      resolver: RESOLVER,
    }
    expect(encodeMigrationData({ ...base, label: 'alice' })).not.toBe(
      encodeMigrationData({ ...base, label: 'bob' }),
    )
    expect(encodeMigrationData({ ...base, label: 'alice' })).not.toBe(
      encodeMigrationData({
        ...base,
        label: 'alice',
        subregistry: SUBREGISTRY,
      }),
    )
  })
})
