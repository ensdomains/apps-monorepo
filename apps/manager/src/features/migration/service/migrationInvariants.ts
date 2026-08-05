import { isKnownPublicResolver } from '@ens-apps/migration'
import {
  computeResolverAddress,
  ROLES_ALL,
  verifyStandaloneHca,
} from '@ens-apps/smart-account'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { type Address, isAddressEqual, type PublicClient, parseAbi } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'
import { V2_CONTRACTS } from '../contracts/addresses'
import { type ClassifiedName, FUSES, hasFuse } from './classifyNames'

const verifiableFactoryAbi = parseAbi([
  'function verifyContract(address proxy) view returns (address implementation)',
])
const resolverRolesAbi = parseAbi([
  'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)',
])
const standaloneHcaFactoryAbi = parseAbi([
  'function approvedImplementations(address implementation) view returns (bool)',
])
const publicResolverSetAbi = parseAbi([
  'function includes(address addr) view returns (bool)',
])

export type RequiredMigrationContractName =
  | 'ETHRegistry'
  | 'RootRegistry'
  | 'VerifiableFactory'
  | 'VerifiableFactoryProxyLogic'
  | 'PermissionedResolverImpl'
  | 'UnlockedMigrationController'
  | 'LockedMigrationController'
  | 'PublicResolverSet'
  | 'WrapperRegistryImpl'
  | 'MigrationHelper'
  | 'DefaultResolver'
  | 'StandaloneHCAFactory'
  | 'StandaloneHCAImplementation'
  | 'HCAOwnerAndSessionValidator'

export type MigrationContractInvariant =
  | 'missing-code'
  | 'hca-certification'
  | 'hca-implementation-approved'
  | 'resolver-certification'
  | 'resolver-implementation'
  | 'resolver-hca-root-roles'
  | 'public-resolver-set-membership'

export class MigrationContractInvariantError extends TaggedError(
  'MigrationContractInvariantError',
)<{
  readonly invariant: MigrationContractInvariant
  readonly contractName: RequiredMigrationContractName | 'HCA' | 'OwnedResolver'
  readonly address: Address
  readonly expected?: string
  readonly actual?: string
  readonly cause?: unknown
}> {}

export const REQUIRED_MIGRATION_CONTRACTS = [
  ['ETHRegistry', V2_CONTRACTS.ETHRegistry],
  ['RootRegistry', V2_CONTRACTS.RootRegistry],
  ['VerifiableFactory', V2_CONTRACTS.VerifiableFactory],
  ['VerifiableFactoryProxyLogic', V2_CONTRACTS.VerifiableFactoryProxyLogic],
  ['PermissionedResolverImpl', V2_CONTRACTS.PermissionedResolverImpl],
  ['UnlockedMigrationController', V2_CONTRACTS.UnlockedMigrationController],
  ['LockedMigrationController', V2_CONTRACTS.LockedMigrationController],
  ['PublicResolverSet', V2_CONTRACTS.PublicResolverSet],
  ['WrapperRegistryImpl', V2_CONTRACTS.WrapperRegistryImpl],
  ['MigrationHelper', V2_CONTRACTS.MigrationHelper],
  ['DefaultResolver', V2_CONTRACTS.DefaultResolver],
  ['StandaloneHCAFactory', V2_CONTRACTS.StandaloneHCAFactory],
  ['StandaloneHCAImplementation', V2_CONTRACTS.StandaloneHCAImplementation],
  ['HCAOwnerAndSessionValidator', V2_CONTRACTS.HCAOwnerAndSessionValidator],
] as const satisfies readonly (readonly [
  RequiredMigrationContractName,
  Address,
])[]

const hasCode = (code: string | undefined): boolean =>
  Boolean(code && code !== '0x')

/** Fail closed when the configured PR #388 namespace is not deployed. */
export const assertRequiredMigrationContractCode = async (params: {
  readonly publicClient: PublicClient
}): Promise<void> => {
  const codes = await Promise.all(
    REQUIRED_MIGRATION_CONTRACTS.map(([, address]) =>
      params.publicClient.getCode({ address }),
    ),
  )

  for (const [
    index,
    [contractName, address],
  ] of REQUIRED_MIGRATION_CONTRACTS.entries()) {
    if (!hasCode(codes[index])) {
      throw new MigrationContractInvariantError({
        invariant: 'missing-code',
        contractName,
        address,
      })
    }
  }
}

const requiresPinnedPublicResolverMembership = (
  name: ClassifiedName,
): name is ClassifiedName & { readonly v1ResolverAddress: Address } =>
  (name.tokenType === 'locked-2ld' || name.tokenType === 'locked-child') &&
  hasFuse(name.fuses, FUSES.CANNOT_SET_RESOLVER) &&
  isKnownPublicResolver(name.v1ResolverAddress)

/**
 * Locked migration cannot apply the app's resolver choice when
 * CANNOT_SET_RESOLVER is burned. The controller replaces the old resolver only
 * when PublicResolverSet certifies it, so prove that membership before asking
 * the wallet to sign anything.
 */
export const assertLockedPublicResolverSetMembership = async (params: {
  readonly publicClient: PublicClient
  readonly names: readonly ClassifiedName[]
}): Promise<void> => {
  const resolvers = new Map<string, Address>()
  for (const name of params.names) {
    if (!requiresPinnedPublicResolverMembership(name)) continue
    resolvers.set(name.v1ResolverAddress.toLowerCase(), name.v1ResolverAddress)
  }

  await Promise.all(
    [...resolvers.values()].map(async (resolver) => {
      let included: boolean
      try {
        included = await params.publicClient.readContract({
          address: V2_CONTRACTS.PublicResolverSet,
          abi: publicResolverSetAbi,
          functionName: 'includes',
          args: [resolver],
        })
      } catch (cause) {
        throw new MigrationContractInvariantError({
          invariant: 'public-resolver-set-membership',
          contractName: 'PublicResolverSet',
          address: resolver,
          expected: 'included',
          actual: 'unverified',
          cause,
        })
      }

      if (!included) {
        throw new MigrationContractInvariantError({
          invariant: 'public-resolver-set-membership',
          contractName: 'PublicResolverSet',
          address: resolver,
          expected: 'included',
          actual: 'not-included',
        })
      }
    }),
  )
}

export type MigrationHcaReadiness =
  | { readonly status: 'deployment-required'; readonly hca: Address }
  | {
      readonly status: 'verified'
      readonly hca: Address
      readonly implementation: Address
    }

/**
 * A counterfactual HCA is valid but must be deployed before direct owner calls.
 * An existing HCA is reused only after the shared factory/owner/accountId/
 * implementation certification succeeds.
 */
export const checkMigrationHcaReadiness = async (params: {
  readonly publicClient: PublicClient
  readonly hca: Address
  readonly expectedOwner: Address
}): Promise<MigrationHcaReadiness> => {
  const code = await params.publicClient.getCode({ address: params.hca })
  if (!hasCode(code)) {
    const approved = await params.publicClient.readContract({
      address: V2_CONTRACTS.StandaloneHCAFactory,
      abi: standaloneHcaFactoryAbi,
      functionName: 'approvedImplementations',
      args: [V2_CONTRACTS.StandaloneHCAImplementation],
    })
    if (!approved) {
      throw new MigrationContractInvariantError({
        invariant: 'hca-implementation-approved',
        contractName: 'StandaloneHCAImplementation',
        address: V2_CONTRACTS.StandaloneHCAImplementation,
        expected: 'approved',
        actual: 'not-approved',
      })
    }
    return { status: 'deployment-required', hca: params.hca }
  }

  try {
    const implementation = await verifyStandaloneHca({
      publicClient: params.publicClient,
      hca: params.hca,
      expectedOwner: params.expectedOwner,
      chainId: sepoliaWithEns.id,
    })
    return { status: 'verified', hca: params.hca, implementation }
  } catch (cause) {
    throw new MigrationContractInvariantError({
      invariant: 'hca-certification',
      contractName: 'HCA',
      address: params.hca,
      cause,
    })
  }
}

export type MigrationResolverReadiness =
  | { readonly status: 'not-required' }
  | { readonly status: 'deployment-required'; readonly resolver: Address }
  | {
      readonly status: 'verified'
      readonly resolver: Address
      readonly implementation: Address
      readonly hcaHasRootRoles: true
      readonly walletHasWildcardRoles: boolean
    }

export const getMigrationResolverAddress = (hca: Address): Address =>
  computeResolverAddress({ chainId: sepoliaWithEns.id, hca })

/**
 * Verify a reused HCA resolver; counterfactual resolvers remain deployable.
 *
 * `authorizeNameRoles(0x00, ROLES_ALL, wallet, true)` maps the empty DNS name
 * to the resolver root resource. We report that wallet grant separately from
 * the HCA's initializer grant even though both use `hasRootRoles` on-chain.
 */
export const checkMigrationResolverReadiness = async (params: {
  readonly publicClient: PublicClient
  readonly resolver: Address | null
  readonly hca: Address
  readonly wallet: Address
}): Promise<MigrationResolverReadiness> => {
  const { publicClient, resolver, hca, wallet } = params
  if (!resolver) return { status: 'not-required' }

  const code = await publicClient.getCode({ address: resolver })
  if (!hasCode(code)) return { status: 'deployment-required', resolver }

  let implementation: Address
  try {
    implementation = await publicClient.readContract({
      address: V2_CONTRACTS.VerifiableFactory,
      abi: verifiableFactoryAbi,
      functionName: 'verifyContract',
      args: [resolver],
    })
  } catch (cause) {
    throw new MigrationContractInvariantError({
      invariant: 'resolver-certification',
      contractName: 'OwnedResolver',
      address: resolver,
      cause,
    })
  }

  if (!isAddressEqual(implementation, V2_CONTRACTS.PermissionedResolverImpl)) {
    throw new MigrationContractInvariantError({
      invariant: 'resolver-implementation',
      contractName: 'OwnedResolver',
      address: resolver,
      expected: V2_CONTRACTS.PermissionedResolverImpl,
      actual: implementation,
    })
  }

  const [hcaHasRootRoles, walletHasWildcardRoles] = await Promise.all([
    publicClient.readContract({
      address: resolver,
      abi: resolverRolesAbi,
      functionName: 'hasRootRoles',
      args: [ROLES_ALL, hca],
    }),
    publicClient.readContract({
      address: resolver,
      abi: resolverRolesAbi,
      functionName: 'hasRootRoles',
      args: [ROLES_ALL, wallet],
    }),
  ])
  if (!hcaHasRootRoles) {
    throw new MigrationContractInvariantError({
      invariant: 'resolver-hca-root-roles',
      contractName: 'OwnedResolver',
      address: resolver,
      expected: ROLES_ALL.toString(),
      actual: 'missing',
    })
  }
  return {
    status: 'verified',
    resolver,
    implementation,
    hcaHasRootRoles: true,
    walletHasWildcardRoles,
  }
}

export const checkDeterministicMigrationResolverReadiness = (params: {
  readonly publicClient: PublicClient
  readonly hca: Address
  readonly wallet: Address
}): Promise<MigrationResolverReadiness> =>
  checkMigrationResolverReadiness({
    ...params,
    resolver: getMigrationResolverAddress(params.hca),
  })

export type MigrationPreflightInvariantReport = {
  readonly hca: MigrationHcaReadiness
  readonly ownedResolver: MigrationResolverReadiness
}

export const assertMigrationPreflightInvariants = async (params: {
  readonly publicClient: PublicClient
  readonly hca: Address
  readonly expectedOwner: Address
  readonly ownedResolver: Address | null
}): Promise<MigrationPreflightInvariantReport> => {
  await assertRequiredMigrationContractCode({
    publicClient: params.publicClient,
  })
  const [hca, ownedResolver] = await Promise.all([
    checkMigrationHcaReadiness(params),
    checkMigrationResolverReadiness({
      publicClient: params.publicClient,
      resolver: params.ownedResolver,
      hca: params.hca,
      wallet: params.expectedOwner,
    }),
  ])
  return { hca, ownedResolver }
}
