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

describe('createMigrationData', () => {
  it('defaults subregistry to zeroAddress when not provided', () => {
    const data = createMigrationData({
      label: 'alice',
      owner: OWNER,
      resolver: RESOLVER,
    })
    expect(data).toEqual({
      label: 'alice',
      owner: OWNER,
      subregistry: zeroAddress,
      resolver: RESOLVER,
    })
  })

  it('uses provided subregistry when given', () => {
    const data = createMigrationData({
      label: 'alice',
      owner: OWNER,
      resolver: RESOLVER,
      subregistry: SUBREGISTRY,
    })
    expect(data.subregistry).toBe(SUBREGISTRY)
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
    const encoded = encodeMigrationData(input)
    const [decoded] = decodeAbiParameters(TUPLE, encoded) as [MigrationData]
    expect(decoded.label).toBe(input.label)
    expect(decoded.owner.toLowerCase()).toBe(OWNER.toLowerCase())
    expect(decoded.subregistry.toLowerCase()).toBe(SUBREGISTRY.toLowerCase())
    expect(decoded.resolver.toLowerCase()).toBe(RESOLVER.toLowerCase())
  })

  it('differs across different labels', () => {
    const a = encodeMigrationData({
      label: 'alice',
      owner: OWNER,
      subregistry: zeroAddress,
      resolver: RESOLVER,
    })
    const b = encodeMigrationData({
      label: 'bob',
      owner: OWNER,
      subregistry: zeroAddress,
      resolver: RESOLVER,
    })
    expect(a).not.toBe(b)
  })

  it('encodes a custom subregistry distinctly from zeroAddress', () => {
    const zeroSub = encodeMigrationData({
      label: 'alice',
      owner: OWNER,
      subregistry: zeroAddress,
      resolver: RESOLVER,
    })
    const customSub = encodeMigrationData({
      label: 'alice',
      owner: OWNER,
      subregistry: SUBREGISTRY,
      resolver: RESOLVER,
    })
    expect(customSub).not.toBe(zeroSub)

    const [decoded] = decodeAbiParameters(TUPLE, customSub) as [MigrationData]
    expect(decoded.subregistry.toLowerCase()).toBe(SUBREGISTRY.toLowerCase())
  })
})
