import { type Address, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { createMigrationData, type MigrationData } from './encodeMigration'

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const RESOLVER: Address = '0x0000000000000000000000000000000000000002'
const SUBREGISTRY: Address = '0x0000000000000000000000000000000000000003'

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

// Note: MigrationData type is verified via TypeScript; no runtime test needed beyond createMigrationData.
const _typeCheck: MigrationData = {
  label: 'test',
  owner: OWNER,
  subregistry: zeroAddress,
  resolver: RESOLVER,
}
void _typeCheck
