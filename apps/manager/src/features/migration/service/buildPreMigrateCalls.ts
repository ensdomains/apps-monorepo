import type { ZeroDevCall } from '@ens-apps/transaction-manager'
import { type Address, encodeFunctionData } from 'viem'
import { PRE_MIGRATION_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import type { ClassifiedName } from './classifyNames'

const getPreMigrateParams = (name: ClassifiedName) => ({
  label: name.label,
  expiry: BigInt(
    name.domain.wrappedDomain?.expiryDate ??
      name.domain.registration?.expiryDate ??
      (() => {
        throw new Error(`No expiry found for ${name.domain.name}`)
      })(),
  ),
  registry: V1_CONTRACTS.ENSRegistry,
  resolver: (name.v1ResolverAddress || V1_CONTRACTS.PublicResolver) as Address,
})

export const buildPreMigrateCall = (name: ClassifiedName): ZeroDevCall => {
  const params = getPreMigrateParams(name)
  return {
    to: V2_CONTRACTS.PreMigrationController,
    data: encodeFunctionData({
      abi: PRE_MIGRATION_ABI,
      functionName: 'preMigrate',
      args: [params.label, params.expiry, params.registry, params.resolver],
    }),
    value: 0n,
  }
}

export const buildPreMigrateCalls = (
  names: readonly ClassifiedName[],
): ZeroDevCall[] => names.map(buildPreMigrateCall)
