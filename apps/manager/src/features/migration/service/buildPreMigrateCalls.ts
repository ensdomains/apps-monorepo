import { type Address, encodeFunctionData } from 'viem'
import { PRE_MIGRATION_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import type { ClassifiedName } from './classifyNames'

const MULTICALL3_ADDRESS =
  '0xcA11bde05977b3631167028862bE2a173976CA11' as Address
const MULTICALL3_ABI = [
  {
    name: 'aggregate3',
    type: 'function' as const,
    stateMutability: 'payable' as const,
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]' as const,
        components: [
          { name: 'target', type: 'address' as const },
          { name: 'allowFailure', type: 'bool' as const },
          { name: 'callData', type: 'bytes' as const },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]' as const,
        components: [
          { name: 'success', type: 'bool' as const },
          { name: 'returnData', type: 'bytes' as const },
        ],
      },
    ],
  },
] as const

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
    abi: MULTICALL3_ABI,
    functionName: 'aggregate3' as const,
    args: [calls] as const,
  }
}
