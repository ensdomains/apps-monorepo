import { type Address, encodeAbiParameters, type Hex, zeroAddress } from 'viem'

export type MigrationData = {
  readonly label: string
  readonly owner: Address
  readonly subregistry: Address
  readonly resolver: Address
}

const MIGRATION_DATA_COMPONENTS = [
  { name: 'label', type: 'string' },
  { name: 'owner', type: 'address' },
  { name: 'subregistry', type: 'address' },
  { name: 'resolver', type: 'address' },
] as const

export function encodeMigrationData(data: MigrationData): Hex {
  return encodeAbiParameters(
    [{ type: 'tuple', components: MIGRATION_DATA_COMPONENTS }],
    [data],
  )
}

export function encodeMigrationDataBatch(data: readonly MigrationData[]): Hex {
  return encodeAbiParameters(
    [{ type: 'tuple[]', components: MIGRATION_DATA_COMPONENTS }],
    [data],
  )
}

export function createMigrationData(params: {
  label: string
  owner: Address
  resolver: Address
  subregistry?: Address
}): MigrationData {
  return {
    label: params.label,
    owner: params.owner,
    subregistry: params.subregistry ?? zeroAddress,
    resolver: params.resolver,
  }
}
