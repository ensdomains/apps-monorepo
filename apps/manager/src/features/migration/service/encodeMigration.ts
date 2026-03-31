import { type Address, encodeAbiParameters, type Hex, zeroAddress } from 'viem'

/** Matches LibMigration.Data in Solidity */
export type MigrationData = {
  label: string
  owner: Address
  subregistry: Address
  resolver: Address
}

/**
 * ABI parameter components for LibMigration.Data tuple.
 * Used for both single and batch encoding.
 */
const MIGRATION_DATA_COMPONENTS = [
  { name: 'label', type: 'string' },
  { name: 'owner', type: 'address' },
  { name: 'subregistry', type: 'address' },
  { name: 'resolver', type: 'address' },
] as const

/**
 * Encode a single LibMigration.Data for safeTransferFrom data parameter.
 * Used for individual name migration (both ERC-721 and ERC-1155).
 */
export function encodeMigrationData(data: MigrationData): Hex {
  return encodeAbiParameters(
    [{ type: 'tuple', components: MIGRATION_DATA_COMPONENTS }],
    [data],
  )
}

/**
 * Encode an array of LibMigration.Data for safeBatchTransferFrom data parameter.
 * Used for batch NameWrapper migration.
 */
export function encodeMigrationDataBatch(data: readonly MigrationData[]): Hex {
  return encodeAbiParameters(
    [{ type: 'tuple[]', components: MIGRATION_DATA_COMPONENTS }],
    [data],
  )
}

/**
 * Create a MigrationData struct with sensible defaults.
 * subregistry defaults to zeroAddress (no child registry for unlocked/unwrapped).
 * For locked names, the contract deploys a WrapperRegistry regardless of this value.
 */
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
