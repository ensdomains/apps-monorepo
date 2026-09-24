import { BASE_REGISTRAR_ABI, isKnownPublicResolver } from '@ens-apps/migration'
import { ROLES_ALL } from '@ens-apps/smart-account'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import {
  registryOwnerSnippet,
  registryResolverSnippet,
} from '@ensdomains/ensjs-abi/registry'
import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import {
  type Address,
  isAddressEqual,
  namehash,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from 'viem'
import { config } from '@/config'

import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import {
  type ClassifiedName,
  type CopyClassifiedName,
  type DirectClassifiedName,
  FUSES,
  hasFuse,
} from './classifyNames'
import { computeUserRegistryAddress } from './userRegistryMigration'

const MAX_UINT64 = (1n << 64n) - 1n
const DOT_ETH_GRACE_PERIOD_SECONDS = 90n * 24n * 60n * 60n
const STATUS_AVAILABLE = 0

const factoryReadAbi = parseAbi([
  'function verifyContract(address proxy) view returns (address implementation)',
])

const registryReadAbi = parseAbi([
  'struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getSubregistry(string label) view returns (address)',
  'function getParent() view returns (address parent, string label)',
  'function getState(uint256 anyId) view returns (State state)',
  'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)',
])

type CopyMigrationReadinessFailure =
  | 'invalid-route'
  | 'source-owner-changed'
  | 'source-expiry-changed'
  | 'source-lock-changed'
  | 'source-resolver-changed'
  | 'unsupported-resolver'
  | 'unexpected-registry'
  | 'missing-registry'
  | 'uncertified-registry'
  | 'registry-roles-mismatch'
  | 'registry-parent-mismatch'
  | 'subregistry-conflict'
  | 'v2-name-history'
  | 'read-failed'

class CopyMigrationReadinessError extends TaggedError(
  'CopyMigrationReadinessError',
)<{
  readonly message: string
  readonly reason: CopyMigrationReadinessFailure
  readonly ensName: string
  readonly cause?: unknown
}> {}

const copyNames = (
  names: readonly ClassifiedName[],
): readonly CopyClassifiedName[] =>
  names.filter((name): name is CopyClassifiedName => name.action === 'copy')

const normalizedName = (name: string): string => name.toLowerCase()
const nameDepth = (name: string): number => name.split('.').length

const hasCompleteCopyRoute = (
  copy: CopyClassifiedName,
  byName: ReadonlyMap<string, ClassifiedName>,
): boolean => {
  const visited = new Set<string>()
  let parentName = copy.parentName

  while (parentName && normalizedName(parentName) !== 'eth') {
    const key = normalizedName(parentName)
    if (visited.has(key)) return false
    visited.add(key)

    const parent = byName.get(key)
    if (!parent) return false
    if (parent.action === 'migrate') {
      return (
        normalizedName(parent.parentName ?? '') === 'eth' &&
        (parent.tokenType === 'unwrapped' || parent.tokenType === 'unlocked')
      )
    }
    parentName = parent.parentName
  }

  return false
}

/**
 * Prove that every copied node has a complete selected chain ending at an
 * unlocked/unwrapped 2LD that is directly migrating in this plan.
 */
export const assertCopyMigrationTopology = (
  registryContext: readonly ClassifiedName[],
): void => {
  const byName = new Map(
    registryContext.map(
      (name) => [normalizedName(name.domain.name), name] as const,
    ),
  )

  for (const copy of copyNames(registryContext)) {
    if (!hasCompleteCopyRoute(copy, byName)) {
      throw new CopyMigrationReadinessError({
        message: `Copied name "${copy.domain.name}" does not have a complete selected UserRegistry route`,
        reason: 'invalid-route',
        ensName: copy.domain.name,
      })
    }
  }
}

const expectedSourceResolver = (name: ClassifiedName): Address =>
  (name.v1ResolverAddress ?? zeroAddress) as Address

const sourceError = (
  name: ClassifiedName,
  reason: CopyMigrationReadinessFailure,
  message: string,
): CopyMigrationReadinessError =>
  new CopyMigrationReadinessError({
    message,
    reason,
    ensName: name.domain.name,
  })

const assertWrappedSourceFresh = async (params: {
  readonly publicClient: PublicClient
  readonly wallet: Address
  readonly copy: CopyClassifiedName
}): Promise<void> => {
  const { publicClient, wallet, copy } = params
  const [owner, fuses, expiry] = await publicClient.readContract({
    address: V1_CONTRACTS.NameWrapper,
    abi: nameWrapperGetDataSnippet,
    functionName: 'getData',
    args: [BigInt(copy.domain.id)],
  })

  if (!isAddressEqual(owner, wallet)) {
    throw sourceError(
      copy,
      'source-owner-changed',
      `The V1 owner of "${copy.domain.name}" changed after selection`,
    )
  }
  if (hasFuse(BigInt(fuses), FUSES.CANNOT_UNWRAP)) {
    throw sourceError(
      copy,
      'source-lock-changed',
      `"${copy.domain.name}" became locked after selection`,
    )
  }
  // Parent-controlled NameWrapper subnames may retain an unset zero expiry.
  // Once emancipated, the same value is already expired.
  const hasNoIndependentExpiry =
    expiry === 0n && !hasFuse(BigInt(fuses), FUSES.PARENT_CANNOT_CONTROL)
  const sourceExpired =
    !hasNoIndependentExpiry && expiry <= BigInt(Math.floor(Date.now() / 1000))
  if (expiry !== copy.sourceExpiry || sourceExpired) {
    throw sourceError(
      copy,
      'source-expiry-changed',
      `The V1 expiry of "${copy.domain.name}" changed after selection`,
    )
  }
}

const assertRegistrySourceFresh = async (params: {
  readonly publicClient: PublicClient
  readonly wallet: Address
  readonly copy: CopyClassifiedName
  readonly node: `0x${string}`
}): Promise<void> => {
  const { publicClient, wallet, copy, node } = params
  const owner = await publicClient.readContract({
    address: V1_CONTRACTS.LegacyRegistry,
    abi: registryOwnerSnippet,
    functionName: 'owner',
    args: [node],
  })
  if (!isAddressEqual(owner, wallet)) {
    throw sourceError(
      copy,
      'source-owner-changed',
      `The V1 registry owner of "${copy.domain.name}" changed after selection`,
    )
  }
  if (copy.sourceExpiry !== MAX_UINT64) {
    throw sourceError(
      copy,
      'source-expiry-changed',
      `Registry-only copy "${copy.domain.name}" has an invalid expiry`,
    )
  }
}

const assertSourceResolverFresh = async (params: {
  readonly publicClient: PublicClient
  readonly name: ClassifiedName
  readonly node: `0x${string}`
  readonly requireSupportedResolver: boolean
}): Promise<void> => {
  const { publicClient, name, node } = params
  const resolver = await publicClient.readContract({
    address: V1_CONTRACTS.LegacyRegistry,
    abi: registryResolverSnippet,
    functionName: 'resolver',
    args: [node],
  })

  if (
    params.requireSupportedResolver &&
    !isAddressEqual(resolver, zeroAddress) &&
    !isKnownPublicResolver(resolver, config.chain.id)
  ) {
    throw sourceError(
      name,
      'unsupported-resolver',
      `"${name.domain.name}" now uses an unsupported custom resolver`,
    )
  }
  if (!isAddressEqual(resolver, expectedSourceResolver(name))) {
    throw sourceError(
      name,
      'source-resolver-changed',
      `The V1 resolver of "${name.domain.name}" changed after selection`,
    )
  }
}

const assertCopySourceFresh = async (params: {
  readonly publicClient: PublicClient
  readonly wallet: Address
  readonly copy: CopyClassifiedName
}): Promise<void> => {
  const { publicClient, wallet, copy } = params
  const ensName = copy.domain.name
  const node = namehash(ensName)

  try {
    if (copy.copySource === 'name-wrapper') {
      await assertWrappedSourceFresh({ publicClient, wallet, copy })
    } else {
      await assertRegistrySourceFresh({ publicClient, wallet, copy, node })
    }
    await assertSourceResolverFresh({
      publicClient,
      name: copy,
      node,
      requireSupportedResolver: true,
    })
  } catch (cause) {
    if (cause instanceof CopyMigrationReadinessError) throw cause
    throw new CopyMigrationReadinessError({
      message: `Could not verify the current V1 state of "${ensName}"`,
      reason: 'read-failed',
      ensName,
      cause,
    })
  }
}

export const assertCopySourcesFresh = async (params: {
  readonly publicClient: PublicClient
  readonly wallet: Address
  readonly copies: readonly CopyClassifiedName[]
}): Promise<void> => {
  await Promise.all(
    params.copies.map((copy) =>
      assertCopySourceFresh({
        publicClient: params.publicClient,
        wallet: params.wallet,
        copy,
      }),
    ),
  )
}

const requiredMigratingRoots = (
  registryContext: readonly ClassifiedName[],
): readonly DirectClassifiedName[] => {
  const byName = new Map(
    registryContext.map(
      (name) => [normalizedName(name.domain.name), name] as const,
    ),
  )
  const roots = new Map<string, DirectClassifiedName>()

  for (const copy of copyNames(registryContext)) {
    let parentName = copy.parentName
    while (parentName && normalizedName(parentName) !== 'eth') {
      const parent = byName.get(normalizedName(parentName))
      if (!parent) break
      if (parent.action === 'migrate') {
        roots.set(normalizedName(parent.domain.name), parent)
        break
      }
      parentName = parent.parentName
    }
  }
  return [...roots.values()]
}

const assertUnwrappedMigratingRootFresh = async (params: {
  readonly publicClient: PublicClient
  readonly wallet: Address
  readonly root: DirectClassifiedName
}): Promise<void> => {
  const { publicClient, wallet, root } = params
  const owner = await publicClient.readContract({
    address: V1_CONTRACTS.BaseRegistrar,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'ownerOf',
    args: [BigInt(root.domain.labelhash)],
  })
  if (!isAddressEqual(owner, wallet)) {
    throw sourceError(
      root,
      'source-owner-changed',
      `The V1 owner of migrating parent "${root.domain.name}" changed after selection`,
    )
  }
}

const assertUnlockedMigratingRootFresh = async (params: {
  readonly publicClient: PublicClient
  readonly wallet: Address
  readonly root: DirectClassifiedName
}): Promise<void> => {
  const { publicClient, wallet, root } = params
  const [owner, fuses, expiry] = await publicClient.readContract({
    address: V1_CONTRACTS.NameWrapper,
    abi: nameWrapperGetDataSnippet,
    functionName: 'getData',
    args: [BigInt(root.domain.id)],
  })
  if (!isAddressEqual(owner, wallet)) {
    throw sourceError(
      root,
      'source-owner-changed',
      `The V1 owner of migrating parent "${root.domain.name}" changed after selection`,
    )
  }
  if (hasFuse(BigInt(fuses), FUSES.CANNOT_UNWRAP)) {
    throw sourceError(
      root,
      'source-lock-changed',
      `Migrating parent "${root.domain.name}" became locked after selection`,
    )
  }
  const expectedExpiry = root.domain.wrappedDomain?.expiryDate
  const transferExpiry = hasFuse(BigInt(fuses), FUSES.IS_DOT_ETH)
    ? expiry - DOT_ETH_GRACE_PERIOD_SECONDS
    : expiry
  if (
    expectedExpiry === undefined ||
    expiry !== BigInt(expectedExpiry) ||
    transferExpiry <= BigInt(Math.floor(Date.now() / 1000))
  ) {
    throw sourceError(
      root,
      'source-expiry-changed',
      `The V1 expiry of migrating parent "${root.domain.name}" changed after selection`,
    )
  }
}

const assertMigratingRootSourceFresh = async (params: {
  readonly publicClient: PublicClient
  readonly wallet: Address
  readonly root: DirectClassifiedName
}): Promise<void> => {
  const { publicClient, root } = params
  try {
    if (root.tokenType === 'unwrapped') {
      await assertUnwrappedMigratingRootFresh(params)
    } else {
      await assertUnlockedMigratingRootFresh(params)
    }
    await assertSourceResolverFresh({
      publicClient,
      name: root,
      node: namehash(root.domain.name),
      requireSupportedResolver: false,
    })
  } catch (cause) {
    if (cause instanceof CopyMigrationReadinessError) throw cause
    throw new CopyMigrationReadinessError({
      message: `Could not verify the current V1 parent route for "${root.domain.name}"`,
      reason: 'read-failed',
      ensName: root.domain.name,
      cause,
    })
  }
}

const assertRequiredMigratingRootsFresh = async (params: {
  readonly publicClient: PublicClient
  readonly wallet: Address
  readonly registryContext: readonly ClassifiedName[]
  readonly remainingNames: ReadonlySet<string>
  readonly recordedAttemptNames?: ReadonlySet<string>
}): Promise<void> => {
  const remainingRoots = requiredMigratingRoots(params.registryContext).filter(
    (root) =>
      params.remainingNames.has(normalizedName(root.domain.name)) &&
      !params.recordedAttemptNames?.has(root.domain.name),
  )
  await Promise.all(
    remainingRoots.map((root) =>
      assertMigratingRootSourceFresh({
        publicClient: params.publicClient,
        wallet: params.wallet,
        root,
      }),
    ),
  )
}

type PlannedRegistry = {
  readonly name: ClassifiedName
  readonly registry: Address
  readonly parentRegistry: Address
}

const plannedRegistries = (params: {
  readonly hca: Address
  readonly registryContext: readonly ClassifiedName[]
}): readonly PlannedRegistry[] => {
  const byName = new Map(
    params.registryContext.map(
      (name) => [normalizedName(name.domain.name), name] as const,
    ),
  )
  const parentNames = new Set(
    copyNames(params.registryContext).flatMap((copy) =>
      copy.parentName ? [copy.parentName] : [],
    ),
  )

  return [...parentNames]
    .sort((left, right) => nameDepth(left) - nameDepth(right))
    .map((parentName) => {
      const name = byName.get(normalizedName(parentName))
      if (!name) {
        throw new CopyMigrationReadinessError({
          message: `No selected parent exists for UserRegistry "${parentName}"`,
          reason: 'invalid-route',
          ensName: parentName,
        })
      }
      return {
        name,
        registry: computeUserRegistryAddress({
          hca: params.hca,
          parentName: name.domain.name,
        }),
        parentRegistry:
          normalizedName(name.parentName ?? '') === 'eth'
            ? V2_CONTRACTS.ETHRegistry
            : computeUserRegistryAddress({
                hca: params.hca,
                parentName: name.parentName ?? '',
              }),
      }
    })
}

type HasCode = (address: Address) => Promise<boolean>

const assertConcurrentChecks = async (
  checks: readonly Promise<void>[],
): Promise<void> => {
  const results = await Promise.allSettled(checks)
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (failure) throw failure.reason
}

const createHasCode = (publicClient: PublicClient): HasCode => {
  const cache = new Map<string, Promise<boolean>>()

  return (address) => {
    const key = address.toLowerCase()
    const cached = cache.get(key)
    if (cached) return cached

    const pending = publicClient
      .getCode({ address })
      .then((code) => Boolean(code && code !== '0x'))
    cache.set(key, pending)
    return pending
  }
}

const assertNewRegistrySlot = async (params: {
  readonly publicClient: PublicClient
  readonly planned: PlannedRegistry
  readonly hasCode: HasCode
}): Promise<void> => {
  if (await params.hasCode(params.planned.registry)) {
    throw new CopyMigrationReadinessError({
      message: `The deterministic UserRegistry for "${params.planned.name.domain.name}" already exists`,
      reason: 'unexpected-registry',
      ensName: params.planned.name.domain.name,
    })
  }

  if (!(await params.hasCode(params.planned.parentRegistry))) {
    return
  }
  const current = await params.publicClient.readContract({
    address: params.planned.parentRegistry,
    abi: registryReadAbi,
    functionName: 'getSubregistry',
    args: [params.planned.name.label],
  })
  if (!isAddressEqual(current, zeroAddress)) {
    throw new CopyMigrationReadinessError({
      message: `"${params.planned.name.domain.name}" already has a V2 subregistry`,
      reason: 'subregistry-conflict',
      ensName: params.planned.name.domain.name,
    })
  }
}

const assertExistingRegistry = async (params: {
  readonly publicClient: PublicClient
  readonly hca: Address
  readonly wallet: Address
  readonly planned: PlannedRegistry
  readonly hasCode: HasCode
}): Promise<void> => {
  const { publicClient, hca, wallet, planned } = params
  const ensName = planned.name.domain.name
  if (!(await params.hasCode(planned.registry))) {
    throw new CopyMigrationReadinessError({
      message: `The completed parent "${ensName}" is missing its UserRegistry`,
      reason: 'missing-registry',
      ensName,
    })
  }
  if (!(await params.hasCode(planned.parentRegistry))) {
    throw new CopyMigrationReadinessError({
      message: `The parent registry route for "${ensName}" is missing`,
      reason: 'missing-registry',
      ensName,
    })
  }

  const [implementation, hcaRoles, walletRoles, parent, attached] =
    await Promise.all([
      publicClient.readContract({
        address: V2_CONTRACTS.VerifiableFactory,
        abi: factoryReadAbi,
        functionName: 'verifyContract',
        args: [planned.registry],
      }),
      publicClient.readContract({
        address: planned.registry,
        abi: registryReadAbi,
        functionName: 'hasRootRoles',
        args: [ROLES_ALL, hca],
      }),
      publicClient.readContract({
        address: planned.registry,
        abi: registryReadAbi,
        functionName: 'hasRootRoles',
        args: [ROLES_ALL, wallet],
      }),
      publicClient.readContract({
        address: planned.registry,
        abi: registryReadAbi,
        functionName: 'getParent',
      }),
      publicClient.readContract({
        address: planned.parentRegistry,
        abi: registryReadAbi,
        functionName: 'getSubregistry',
        args: [planned.name.label],
      }),
    ])

  if (!isAddressEqual(implementation, V2_CONTRACTS.UserRegistryImpl)) {
    throw new CopyMigrationReadinessError({
      message: `The UserRegistry for "${ensName}" is not factory-certified`,
      reason: 'uncertified-registry',
      ensName,
    })
  }
  if (!hcaRoles || !walletRoles) {
    throw new CopyMigrationReadinessError({
      message: `The UserRegistry roles for "${ensName}" do not match the migration plan`,
      reason: 'registry-roles-mismatch',
      ensName,
    })
  }
  if (
    !isAddressEqual(parent[0], planned.parentRegistry) ||
    parent[1] !== planned.name.label
  ) {
    throw new CopyMigrationReadinessError({
      message: `The UserRegistry parent for "${ensName}" does not match the canonical route`,
      reason: 'registry-parent-mismatch',
      ensName,
    })
  }
  if (!isAddressEqual(attached, planned.registry)) {
    throw new CopyMigrationReadinessError({
      message: `The V2 subregistry pointer for "${ensName}" conflicts with the migration plan`,
      reason: 'subregistry-conflict',
      ensName,
    })
  }
}

const assertCopyTargetPristine = async (params: {
  readonly publicClient: PublicClient
  readonly hca: Address
  readonly copy: CopyClassifiedName
  readonly hasCode: HasCode
}): Promise<void> => {
  const parentName = params.copy.parentName
  if (!parentName) {
    throw new CopyMigrationReadinessError({
      message: `Copied name "${params.copy.domain.name}" has no selected parent`,
      reason: 'invalid-route',
      ensName: params.copy.domain.name,
    })
  }
  const parentRegistry = computeUserRegistryAddress({
    hca: params.hca,
    parentName,
  })
  if (!(await params.hasCode(parentRegistry))) return

  const state = await params.publicClient.readContract({
    address: parentRegistry,
    abi: registryReadAbi,
    functionName: 'getState',
    args: [labelToCanonicalId(params.copy.label)],
  })
  if (
    state.status !== STATUS_AVAILABLE ||
    state.expiry !== 0n ||
    !isAddressEqual(state.latestOwner, zeroAddress)
  ) {
    throw new CopyMigrationReadinessError({
      message: `"${params.copy.domain.name}" has reserved, registered, or prior V2 history`,
      reason: 'v2-name-history',
      ensName: params.copy.domain.name,
    })
  }
}

const assertPlannedRegistryReadiness = async (params: {
  readonly publicClient: PublicClient
  readonly hca: Address
  readonly wallet: Address
  readonly planned: PlannedRegistry
  readonly isRemaining: boolean
  readonly hasRecordedAttempt: boolean
  readonly hasCode: HasCode
}): Promise<void> => {
  if (!params.isRemaining) {
    await assertExistingRegistry(params)
    return
  }
  if (
    params.hasRecordedAttempt &&
    (await params.hasCode(params.planned.registry))
  ) {
    await assertExistingRegistry(params)
    return
  }
  await assertNewRegistrySlot(params)
}

const assertRegistryRoutesReady = async (params: {
  readonly publicClient: PublicClient
  readonly hca: Address
  readonly wallet: Address
  readonly registryContext: readonly ClassifiedName[]
  readonly remainingNames: ReadonlySet<string>
  readonly recordedAttemptNames?: ReadonlySet<string>
  readonly hasCode: HasCode
}): Promise<void> => {
  await assertConcurrentChecks(
    plannedRegistries(params).map(async (planned) => {
      try {
        await assertPlannedRegistryReadiness({
          publicClient: params.publicClient,
          hca: params.hca,
          wallet: params.wallet,
          planned,
          isRemaining: params.remainingNames.has(
            normalizedName(planned.name.domain.name),
          ),
          hasRecordedAttempt:
            params.recordedAttemptNames?.has(planned.name.domain.name) ?? false,
          hasCode: params.hasCode,
        })
      } catch (cause) {
        if (cause instanceof CopyMigrationReadinessError) throw cause
        throw new CopyMigrationReadinessError({
          message: `Could not verify the V2 UserRegistry route for "${planned.name.domain.name}"`,
          reason: 'read-failed',
          ensName: planned.name.domain.name,
          cause,
        })
      }
    }),
  )
}

const assertRemainingCopyTargetsPristine = async (params: {
  readonly publicClient: PublicClient
  readonly hca: Address
  readonly copies: readonly CopyClassifiedName[]
  readonly recordedAttemptNames?: ReadonlySet<string>
  readonly hasCode: HasCode
}): Promise<void> => {
  await assertConcurrentChecks(
    params.copies.map(async (copy) => {
      if (params.recordedAttemptNames?.has(copy.domain.name)) return
      try {
        await assertCopyTargetPristine({
          publicClient: params.publicClient,
          hca: params.hca,
          copy,
          hasCode: params.hasCode,
        })
      } catch (cause) {
        if (cause instanceof CopyMigrationReadinessError) throw cause
        throw new CopyMigrationReadinessError({
          message: `Could not prove that "${copy.domain.name}" is unused in V2`,
          reason: 'read-failed',
          ensName: copy.domain.name,
          cause,
        })
      }
    }),
  )
}

/**
 * Freeze the copy source values and fail closed on deterministic registry or
 * V2 target conflicts immediately before preview/live gas estimation.
 */
export const assertCopyMigrationReadiness = async (params: {
  readonly publicClient: PublicClient
  readonly hca: Address
  readonly wallet: Address
  readonly remaining: readonly ClassifiedName[]
  readonly registryContext: readonly ClassifiedName[]
  /** Durable wallet attempts may already have created exact V2 state. */
  readonly recordedAttemptNames?: ReadonlySet<string>
}): Promise<void> => {
  assertCopyMigrationTopology(params.registryContext)
  const remainingNames = new Set(
    params.remaining.map((name) => normalizedName(name.domain.name)),
  )
  const remainingCopies = copyNames(params.remaining)
  const hasCode = createHasCode(params.publicClient)

  await assertConcurrentChecks([
    assertRequiredMigratingRootsFresh({
      publicClient: params.publicClient,
      wallet: params.wallet,
      registryContext: params.registryContext,
      remainingNames,
      recordedAttemptNames: params.recordedAttemptNames,
    }),
    assertCopySourcesFresh({
      publicClient: params.publicClient,
      wallet: params.wallet,
      copies: remainingCopies,
    }),
    assertRegistryRoutesReady({
      publicClient: params.publicClient,
      hca: params.hca,
      wallet: params.wallet,
      registryContext: params.registryContext,
      remainingNames,
      recordedAttemptNames: params.recordedAttemptNames,
      hasCode,
    }),
    assertRemainingCopyTargetsPristine({
      publicClient: params.publicClient,
      hca: params.hca,
      copies: remainingCopies,
      recordedAttemptNames: params.recordedAttemptNames,
      hasCode,
    }),
  ])
}
