import { type Address, encodeFunctionData } from 'viem'
import { PRE_MIGRATION_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import type { ClassifiedName } from './classifyNames'

export const ENABLE_PRE_MIGRATE = true

type PreMigrateParams = {
  readonly label: string
  readonly expiry: bigint
  readonly registry: Address
  readonly resolver: Address
}

function getPreMigrateParams(name: ClassifiedName): PreMigrateParams {
  const expiry =
    name.domain.wrappedDomain?.expiryDate ??
    name.domain.registration?.expiryDate
  if (!expiry) {
    throw new Error(`No expiry found for ${name.domain.name}`)
  }

  return {
    label: name.label,
    expiry: BigInt(expiry),
    registry: V1_CONTRACTS.ENSRegistry,
    resolver:
      (name.v1ResolverAddress as Address) ?? V1_CONTRACTS.PublicResolver,
  }
}

export function buildPreMigrateCall(name: ClassifiedName) {
  const params = getPreMigrateParams(name)
  return {
    address: V2_CONTRACTS.PreMigrationController,
    abi: PRE_MIGRATION_ABI,
    functionName: 'preMigrate' as const,
    args: [
      params.label,
      params.expiry,
      params.registry,
      params.resolver,
    ] as const,
  }
}

export function buildPreMigrateMulticall(names: readonly ClassifiedName[]) {
  const calldata = names.map((name) => {
    const params = getPreMigrateParams(name)
    return encodeFunctionData({
      abi: PRE_MIGRATION_ABI,
      functionName: 'preMigrate',
      args: [params.label, params.expiry, params.registry, params.resolver],
    })
  })

  return {
    address: V2_CONTRACTS.PreMigrationController,
    abi: PRE_MIGRATION_ABI,
    functionName: 'multicall' as const,
    args: [calldata] as const,
  }
}
