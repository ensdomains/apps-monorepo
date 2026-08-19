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
  type Hex,
  isAddressEqual,
  keccak256,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'
import { V2_CONTRACTS } from '../contracts/addresses'
import { type ClassifiedName, FUSES, hasFuse } from './classifyNames'
import { computeExpectedWrapperRegistry } from './directMigrationRoutes'

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
  | 'bytecode-hash'
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

export const REQUIRED_MIGRATION_CONTRACTS = [
  ['ETHRegistry', V2_CONTRACTS.ETHRegistry],
  ['RootRegistry', V2_CONTRACTS.RootRegistry],
  ['VerifiableFactory', V2_CONTRACTS.VerifiableFactory],
  ['VerifiableFactoryProxyLogic', V2_CONTRACTS.VerifiableFactoryProxyLogic],
  ['PermissionedResolverImpl', V2_CONTRACTS.PermissionedResolverImpl],
  ['UserRegistryImpl', V2_CONTRACTS.UserRegistryImpl],
  ['UnlockedMigrationController', V2_CONTRACTS.UnlockedMigrationController],
  ['LockedMigrationController', V2_CONTRACTS.LockedMigrationController],
  ['MigrationHelper', V2_CONTRACTS.MigrationHelper],
  ['PublicResolverSet', V2_CONTRACTS.PublicResolverSet],
  ['WrapperRegistryImpl', V2_CONTRACTS.WrapperRegistryImpl],
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

/** Fail closed when any configured migration contract is not deployed. */
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

export const MIGRATION_HELPER_RUNTIME_CODE_HASH =
  '0x0b8acb00c2912a8b43085e0f55f9459b956cb51be1a16a5ff7ef0346dbd18143' as const

/**
 * Pin the exact HCA-aware helper runtime, including its immutable factory and
 * controller wiring. The Sepolia deployment is not source-verified yet, so a
 * code-existence check alone is insufficient.
 */
export const assertMigrationHelperRuntimeCode = async (params: {
  readonly publicClient: PublicClient
  readonly expectedRuntimeCodeHash?: Hex
}): Promise<void> => {
  const code = await params.publicClient.getCode({
    address: V2_CONTRACTS.MigrationHelper,
  })
  if (!hasCode(code)) {
    throw new MigrationContractInvariantError({
      invariant: 'missing-code',
      contractName: 'MigrationHelper',
      address: V2_CONTRACTS.MigrationHelper,
    })
  }

  const expected =
    params.expectedRuntimeCodeHash ?? MIGRATION_HELPER_RUNTIME_CODE_HASH
  const actual = keccak256(code as Hex)
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new MigrationContractInvariantError({
      invariant: 'bytecode-hash',
      contractName: 'MigrationHelper',
      address: V2_CONTRACTS.MigrationHelper,
      expected,
      actual,
    })
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
 * Where a selected name's subregistry pointer gets written, or `null` when the
 * destination registry is created by this same migration — a wrapper deployed
 * mid-plan holds no entries, so it has nothing to detach.
 */
const subregistryWriteFor = (
  name: ClassifiedName,
  selectedNames: ReadonlySet<string>,
): SubregistryWrite | null => {
  // Locked names are re-pointed at their deterministic WrapperRegistry; every
  // other route registers with `address(0)`.
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
 */
export const assertNoLiveSubregistryOverwrite = async ({
  publicClient,
  names,
}: {
  readonly publicClient: PublicClient
  readonly names: readonly ClassifiedName[]
}): Promise<void> => {
  const selectedNames = new Set(names.map((name) => name.domain.name))
  const writes = names
    .map((name) => subregistryWriteFor(name, selectedNames))
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
