import { type Address, encodeFunctionData, multicall3Abi } from 'viem'
import { PRE_MIGRATION_ABI } from '../contracts/abis'
import {
  MULTICALL3_ADDRESS,
  V1_CONTRACTS,
  V2_CONTRACTS,
} from '../contracts/addresses'
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

export const buildPreMigrateCall = (name: ClassifiedName) => {
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

export const buildPreMigrateMulticall = (names: readonly ClassifiedName[]) => {
  const calls = names.map((name) => {
    const params = getPreMigrateParams(name)
    return {
      target: V2_CONTRACTS.PreMigrationController,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: PRE_MIGRATION_ABI,
        functionName: 'preMigrate',
        args: [params.label, params.expiry, params.registry, params.resolver],
      }),
    }
  })

  return {
    address: MULTICALL3_ADDRESS,
    abi: multicall3Abi,
    functionName: 'aggregate3' as const,
    args: [calls] as const,
  }
}
