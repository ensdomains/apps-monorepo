import { isKnownPublicResolver } from '@ens-apps/migration'
import {
  computeResolverAddress,
  ROLES_ALL,
  verifyStandaloneHca,
} from '@ens-apps/smart-account'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { permissionedRegistryGetSubregistrySnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import {
  type Address,
  isAddressEqual,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from 'viem'
import { config } from '@/config'
import { sepoliaWithEns } from '@/lib/wagmi'
import { V2_CONTRACTS } from '../contracts/addresses'
import { type ClassifiedName, FUSES, hasFuse } from './classifyNames'
import {
  computeExpectedWrapperRegistry,
  type DirectMigrationRoute,
} from './directMigrationRoutes'
import { resolverFor } from './encodeMigration'

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
  | 'UserRegistryImpl'
  | 'UnlockedMigrationController'
  | 'LockedMigrationController'
  | 'MigrationHelper'
  | 'PublicResolverSet'
  | 'WrapperRegistryImpl'
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
  | 'live-subregistry-overwrite'

export class MigrationContractInvariantError extends TaggedError(
  'MigrationContractInvariantError',
)<{
  readonly invariant: MigrationContractInvariant
  readonly contractName:
    | RequiredMigrationContractName
    | 'HCA'
    | 'OwnedResolver'
    | 'DestinationRegistry'
  readonly address: Address
  /** The selected name the invariant was checked for, when it is name-scoped. */
  readonly ensName?: string
  readonly expected?: string
  readonly actual?: string
  readonly cause?: unknown
}> {}

const hasCode = (code: string | undefined): boolean =>
  Boolean(code && code !== '0x')

/** Check only the deployed contracts required by this migration. */
export const assertRequiredMigrationContractCode = async (params: {
  readonly publicClient: PublicClient
  readonly contracts: readonly RequiredMigrationContractName[]
}): Promise<void> => {
  const contracts = [...new Set(params.contracts)]
  const codes = await Promise.all(
    contracts.map((name) =>
      params.publicClient.getCode({ address: V2_CONTRACTS[name] }),
    ),
  )

  for (const [index, contractName] of contracts.entries()) {
    if (!hasCode(codes[index])) {
      throw new MigrationContractInvariantError({
        invariant: 'missing-code',
        contractName,
        address: V2_CONTRACTS[contractName],
      })
    }
  }
}

const requiresPinnedPublicResolverMembership = (
  name: ClassifiedName,
): name is ClassifiedName & { readonly v1ResolverAddress: Address } =>
  (name.tokenType === 'locked-2ld' || name.tokenType === 'locked-child') &&
  hasFuse(name.fuses, FUSES.CANNOT_SET_RESOLVER) &&
  isKnownPublicResolver(name.v1ResolverAddress, config.chain.id)

type RequiredMigrationContractsParams = {
  readonly remaining: readonly ClassifiedName[]
  readonly registryContext: readonly ClassifiedName[]
  readonly directRoutes: ReadonlyMap<string, DirectMigrationRoute>
  readonly hcaReadiness: MigrationHcaReadiness
  readonly resolverReadiness?: MigrationResolverReadiness
  readonly ownedResolver: Address | null
}

const directRouteContracts = (
  name: ClassifiedName,
  route: DirectMigrationRoute | undefined,
): RequiredMigrationContractName[] => {
  if (name.action !== 'migrate') return []
  const contracts: RequiredMigrationContractName[] = ['MigrationHelper']
  if (route?.receiverReadiness === 'migration-controller') {
    if (
      isAddressEqual(route.receiver, V2_CONTRACTS.UnlockedMigrationController)
    )
      contracts.push('UnlockedMigrationController')
    if (isAddressEqual(route.receiver, V2_CONTRACTS.LockedMigrationController))
      contracts.push('LockedMigrationController')
  }
  if (name.tokenType === 'locked-child' || name.tokenType === 'detached-child')
    contracts.push('RootRegistry', 'ETHRegistry', 'WrapperRegistryImpl')
  if (route?.expectedWrapperRegistry)
    contracts.push('WrapperRegistryImpl', 'VerifiableFactoryProxyLogic')
  return contracts
}

const nameContracts = (
  name: ClassifiedName,
  params: RequiredMigrationContractsParams,
  registryParents: ReadonlySet<string>,
): RequiredMigrationContractName[] => {
  const contracts = directRouteContracts(
    name,
    params.directRoutes.get(name.domain.name),
  )
  if (name.action === 'copy' || registryParents.has(name.domain.name))
    contracts.push('UserRegistryImpl')
  if (registryParents.has(name.domain.name))
    contracts.push('VerifiableFactoryProxyLogic')
  if (name.resolverStrategy === 'to-owned-permres') {
    contracts.push('PermissionedResolverImpl')
    if (params.resolverReadiness?.status === 'deployment-required')
      contracts.push('VerifiableFactoryProxyLogic')
  }
  if (
    isAddressEqual(
      resolverFor(name, V2_CONTRACTS.DefaultResolver, params.ownedResolver),
      V2_CONTRACTS.DefaultResolver,
    )
  )
    contracts.push('DefaultResolver')
  if (requiresPinnedPublicResolverMembership(name))
    contracts.push('PublicResolverSet')
  return contracts
}

export const getRequiredMigrationContracts = (
  params: RequiredMigrationContractsParams,
): readonly RequiredMigrationContractName[] => {
  if (params.remaining.length === 0) return []
  const contracts: RequiredMigrationContractName[] = [
    'StandaloneHCAFactory',
    'VerifiableFactory',
  ]
  if (params.registryContext.some((name) => name.parentName === 'eth'))
    contracts.push('ETHRegistry')
  if (params.hcaReadiness.status === 'deployment-required')
    contracts.push(
      'StandaloneHCAImplementation',
      'HCAOwnerAndSessionValidator',
      'VerifiableFactoryProxyLogic',
    )
  const registryParents = new Set(
    params.registryContext.flatMap((name) =>
      name.action === 'copy' && name.parentName ? [name.parentName] : [],
    ),
  )
  return [
    ...new Set([
      ...contracts,
      ...params.remaining.flatMap((name) =>
        nameContracts(name, params, registryParents),
      ),
    ]),
  ]
}

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

type SubregistryWrite = {
  readonly ensName: string
  /** Registry holding the name's entry once it lands in V2. */
  readonly registry: Address
  readonly label: string
  /** The subregistry pointer this migration writes into that entry. */
  readonly nextSubregistry: Address
}

const isChildName = (name: ClassifiedName): boolean =>
  name.tokenType === 'locked-child' || name.tokenType === 'detached-child'

/**
 * Where a selected name's subregistry pointer gets written, or `null` when this
 * guard does not own that write:
 *
 * - the destination registry is created by this same migration — a wrapper
 *   deployed mid-plan holds no entries, so it has nothing to detach;
 * - the name is on the UserRegistry route, i.e. copied or the parent of a
 *   copied name. `assertCopyMigrationReadiness` owns both of those slots.
 */
const subregistryWriteFor = ({
  name,
  selectedNames,
  copyParents,
}: {
  readonly name: ClassifiedName
  readonly selectedNames: ReadonlySet<string>
  readonly copyParents: ReadonlySet<string>
}): SubregistryWrite | null => {
  if (name.action === 'copy' || copyParents.has(name.domain.name)) return null

  // Locked names are re-pointed at their deterministic WrapperRegistry; every
  // other direct route registers with `address(0)`.
  const nextSubregistry =
    name.tokenType === 'locked-2ld' || name.tokenType === 'locked-child'
      ? computeExpectedWrapperRegistry({ name: name.domain.name })
      : zeroAddress

  if (!isChildName(name)) {
    return {
      ensName: name.domain.name,
      registry: V2_CONTRACTS.ETHRegistry,
      label: name.label,
      nextSubregistry,
    }
  }

  if (!name.parentName || selectedNames.has(name.parentName)) return null

  return {
    ensName: name.domain.name,
    registry: computeExpectedWrapperRegistry({ name: name.parentName }),
    label: name.label,
    nextSubregistry,
  }
}

/**
 * Refuse to migrate a name whose V2 entry already points at a live child
 * registry (WEB-1249).
 *
 * Registering over an existing entry replaces its `subregistry` wholesale, so
 * the registry that was there — and every subname inside it — is detached and
 * stops resolving. Neither value this migration can write is safe: unlocked
 * routes write `address(0)`, locked routes write the deterministic
 * WrapperRegistry, and both discard whatever was configured. The pointer is
 * only re-read here, before the wallet signs anything, so a name that gained a
 * registry after selection fails closed instead of losing its subnames.
 *
 * This guard owns the direct routes. Every slot that receives a UserRegistry —
 * a copied name's parent, and each copy's own entry inside that registry — is
 * owned by `assertCopyMigrationReadiness`, which re-runs before every batch.
 * The two treat a pointer that already holds the planned value differently,
 * and that is deliberate:
 *
 * - Here, writing a pointer over itself detaches nothing, so it passes.
 * - The UserRegistry route deploys the registry before pointing at it, so a
 *   slot that already holds one is either an earlier attempt or a conflict.
 *   That check accepts it only when the batch journal records such an attempt
 *   and the registry verifies, and refuses any other non-zero pointer.
 */
export const assertNoLiveSubregistryOverwrite = async ({
  publicClient,
  names,
}: {
  readonly publicClient: PublicClient
  readonly names: readonly ClassifiedName[]
}): Promise<void> => {
  const selectedNames = new Set(names.map((name) => name.domain.name))
  // Copies can't complete ahead of their parent, so while a copy parent is
  // still in `names`, its copies are too.
  const copyParents = new Set(
    names.flatMap((name) =>
      name.action === 'copy' && name.parentName ? [name.parentName] : [],
    ),
  )
  const writes = names
    .map((name) => subregistryWriteFor({ name, selectedNames, copyParents }))
    .filter((write): write is SubregistryWrite => write !== null)

  await Promise.all(
    writes.map(async (write) => {
      // An undeployed destination has no entries. Missing parent wrappers are
      // reported by `resolveDirectMigrationRoutes`, which knows the route.
      const code = await publicClient.getCode({ address: write.registry })
      if (!hasCode(code)) return

      let current: Address
      try {
        current = await publicClient.readContract({
          address: write.registry,
          abi: permissionedRegistryGetSubregistrySnippet,
          functionName: 'getSubregistry',
          args: [write.label],
        })
      } catch (cause) {
        throw new MigrationContractInvariantError({
          invariant: 'live-subregistry-overwrite',
          contractName: 'DestinationRegistry',
          address: write.registry,
          ensName: write.ensName,
          expected: write.nextSubregistry,
          actual: 'unverified',
          cause,
        })
      }

      if (isAddressEqual(current, zeroAddress)) return
      // Already pointing where this migration would write it: re-running the
      // plan is a no-op rather than a detach.
      if (isAddressEqual(current, write.nextSubregistry)) return

      throw new MigrationContractInvariantError({
        invariant: 'live-subregistry-overwrite',
        contractName: 'DestinationRegistry',
        address: write.registry,
        ensName: write.ensName,
        expected: write.nextSubregistry,
        actual: current,
      })
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
 * A counterfactual HCA is valid but must be deployed before owner execution.
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
 * The wallet's root roles come from the resolver's `initialize` (its second
 * grant) or a later `grantRootRoles`. We report that wallet grant separately
 * from the HCA's initializer grant even though both use `hasRootRoles` on-chain.
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
