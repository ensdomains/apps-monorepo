import {
  computeVerifiableProxyAddress,
  getDestinationContracts,
} from '@ens-apps/smart-account'
import {
  type Address,
  encodeAbiParameters,
  keccak256,
  namehash,
  type PublicClient,
  parseAbi,
  stringToHex,
} from 'viem'
import type { ClassifiedName } from './classifyNames'
import {
  checkMigrationResolverReadiness,
  MigrationContractInvariantError,
} from './migrationInvariants'

// ResolverRolesLib's seven record setters, without linking, upgrades, or any
// administrative roles. Resolver grants apply to every name on that resolver.
export const RETAINED_MANAGER_RECORD_ROLES = 0x1111111n

const SALT_DOMAIN = keccak256(
  stringToHex('ENSManagerMigrationRetainedManagerResolver:v1'),
)

export const needsRetainedManagerResolver = (name: ClassifiedName): boolean =>
  name.action === 'migrate' &&
  name.tokenType === 'unwrapped' &&
  name.managerAddress !== null &&
  name.resolverStrategy === 'to-owned-permres'

export const computeRetainedManagerResolverSalt = (name: string): bigint =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'bytes32' }],
        [SALT_DOMAIN, namehash(name)],
      ),
    ),
  )

export const computeRetainedManagerResolverAddress = (params: {
  readonly chainId: number
  readonly hca: Address
  readonly name: string
}): Address => {
  const contracts = getDestinationContracts(params.chainId)
  return computeVerifiableProxyAddress({
    factory: contracts.verifiableFactory,
    proxyLogic: contracts.verifiableFactoryProxyLogic,
    deployer: params.hca,
    salt: computeRetainedManagerResolverSalt(params.name),
  })
}

const rolesAbi = parseAbi([
  'function roles(uint256 resource, address account) view returns (uint256)',
  'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)',
])

/**
 * Retries may encounter an already deployed resolver. Verify its implementation
 * and original grants before reusing it; never silently restore revoked access.
 */
export const checkRetainedManagerResolvers = async (params: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly hca: Address
  readonly wallet: Address
  readonly classified: readonly ClassifiedName[]
}): Promise<ReadonlySet<string>> => {
  const deployed = await Promise.all(
    params.classified.filter(needsRetainedManagerResolver).map(async (name) => {
      const resolver = computeRetainedManagerResolverAddress({
        ...params,
        name: name.domain.name,
      })
      const readiness = await checkMigrationResolverReadiness({
        ...params,
        resolver,
      })
      if (readiness.status !== 'verified') return []
      const managerRoles = await params.publicClient.readContract({
        address: resolver,
        abi: rolesAbi,
        functionName: 'roles',
        args: [0n, name.managerAddress as Address],
      })
      if (
        !readiness.hcaHasRootRoles ||
        !readiness.walletHasWildcardRoles ||
        managerRoles !== RETAINED_MANAGER_RECORD_ROLES
      ) {
        throw new MigrationContractInvariantError({
          invariant: 'resolver-writer-roles',
          contractName: 'OwnedResolver',
          address: resolver,
          ensName: name.domain.name,
          expected:
            'owner and HCA control, retained manager record setters only',
          actual: 'original resolver grants are missing',
        })
      }
      return [name.domain.name]
    }),
  )
  return new Set(deployed.flat())
}
