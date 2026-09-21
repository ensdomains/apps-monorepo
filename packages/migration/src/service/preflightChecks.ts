import {
  type EnsContracts,
  getEnsContracts,
  requireChainId,
} from '@ens-apps/config'
import { registryOwnerSnippet } from '@ensdomains/ensjs-abi/registry'
import { permissionedRegistryGetStatusSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { type Address, namehash, type PublicClient, zeroAddress } from 'viem'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { batchedMulticall } from './batchedMulticall'
import { type ClassifiedName, FUSES, hasFuse } from './classifyNames'
import { GRACE_PERIOD_SECONDS } from './constants'

// Resolved from the client each check is given rather than pinned at module
// scope, so these follow whichever network the caller is actually on.
const contractsFor = (publicClient: PublicClient) =>
  getEnsContracts(requireChainId(publicClient, 'migration preflight'))
const RESERVED_STATUS = 1

// Whether a NameWrapper token can actually be transferred right now, matching
// `NameWrapper._beforeTransfer`: `.eth` 2LDs (`IS_DOT_ETH`) become non-transferable
// at the start of their grace period, i.e. `wrapperExpiry - GRACE_PERIOD`.
const isWrappedTokenTransferable = (
  fuses: number,
  wrapperExpiry: bigint,
  nowSeconds: bigint,
): boolean => {
  const transferExpiry = hasFuse(BigInt(fuses), FUSES.IS_DOT_ETH)
    ? wrapperExpiry - GRACE_PERIOD_SECONDS
    : wrapperExpiry
  return transferExpiry > nowSeconds
}

export type EligibilityResult = {
  eligible: ClassifiedName[]
  frozen: ClassifiedName[]
  alreadyMigrated: ClassifiedName[]
  notPremigrated: ClassifiedName[]
  failed: ClassifiedName[]
}

type OwnershipResult = Address | readonly [Address, number, bigint]
type OwnershipContract = Parameters<typeof batchedMulticall>[1][number]

const buildOwnershipContract = (
  name: ClassifiedName,
  contracts: EnsContracts,
): OwnershipContract => {
  if (name.action === 'copy' && name.copySource === 'registry') {
    return {
      address: contracts.LegacyRegistry,
      abi: registryOwnerSnippet,
      functionName: 'owner' as const,
      args: [namehash(name.domain.name)] as const,
    }
  }
  if (name.action === 'migrate' && name.tokenType === 'unwrapped') {
    return {
      address: contracts.BaseRegistrar,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'ownerOf' as const,
      args: [BigInt(name.domain.labelhash)] as const,
    }
  }
  return {
    address: contracts.NameWrapper,
    abi: NAME_WRAPPER_ABI,
    functionName: 'getData' as const,
    args: [BigInt(name.domain.id)] as const,
  }
}

const isWrappedResultUnavailable = (
  name: ClassifiedName,
  result: readonly [Address, number, bigint],
  nowSeconds: bigint,
): boolean =>
  name.action === 'copy'
    ? result[2] <= nowSeconds
    : !isWrappedTokenTransferable(result[1], result[2], nowSeconds)

export const checkOwnership = async (
  publicClient: PublicClient,
  names: readonly ClassifiedName[],
  migrationOwner: Address,
  failed?: Set<string>,
): Promise<Set<string>> => {
  const ids = new Set<string>()
  if (names.length === 0) return ids

  const ensContracts = contractsFor(publicClient)
  const contracts = names.map((name) =>
    buildOwnershipContract(name, ensContracts),
  )

  const results = await batchedMulticall<OwnershipResult>(
    publicClient,
    contracts,
  )

  const expected = migrationOwner.toLowerCase()
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  for (const [i, name] of names.entries()) {
    const r = results[i]
    if (!r || r.status === 'failure') {
      ids.add(name.domain.id)
      failed?.add(name.domain.id)
      continue
    }
    const result = r.result
    const isWrappedToken = typeof result !== 'string'
    const currentOwner = isWrappedToken ? result[0] : result
    if (
      isWrappedToken &&
      isWrappedResultUnavailable(name, result, nowSeconds)
    ) {
      ids.add(name.domain.id)
      continue
    }
    if (currentOwner.toLowerCase() !== expected) {
      ids.add(name.domain.id)
    }
  }

  return ids
}

export const checkFrozenApproval = async (
  publicClient: PublicClient,
  candidates: readonly ClassifiedName[],
  failed?: Set<string>,
): Promise<Set<string>> => {
  const ids = new Set<string>()
  const directCandidates = candidates.filter(
    (candidate) => candidate.action === 'migrate',
  )
  if (directCandidates.length === 0) return ids

  const results = await batchedMulticall<Address>(
    publicClient,
    directCandidates.map((name) => ({
      address: contractsFor(publicClient).NameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: 'getApproved' as const,
      args: [BigInt(name.domain.id)] as const,
    })),
  )

  for (const [i, name] of directCandidates.entries()) {
    const r = results[i]
    if (!r || r.status === 'failure') {
      console.warn(
        `[migration] frozen-approval check failed for ${name.domain.id}; treating as frozen`,
      )
      ids.add(name.domain.id)
      failed?.add(name.domain.id)
      continue
    }
    if (r.result !== zeroAddress) {
      ids.add(name.domain.id)
    }
  }

  return ids
}

/**
 * ENSv2 migration controllers can register only pre-migrated RESERVED 2LDs.
 * Check that invariant in one multicall before a name can reach gas estimation;
 * otherwise NameWrapper masks the receiver's typed revert behind the misleading
 * legacy "non ERC1155Receiver implementer" error.
 */
export const checkPremigrationReservation = async (
  publicClient: PublicClient,
  names: readonly ClassifiedName[],
  failed?: Set<string>,
): Promise<Set<string>> => {
  const ids = new Set<string>()
  const candidates = names.filter(
    (name) =>
      name.action === 'migrate' &&
      (name.tokenType === 'unwrapped' ||
        name.tokenType === 'unlocked' ||
        name.tokenType === 'locked-2ld'),
  )
  if (candidates.length === 0) return ids

  const results = await batchedMulticall<number>(
    publicClient,
    candidates.map((name) => ({
      address: contractsFor(publicClient).ETHRegistry,
      abi: permissionedRegistryGetStatusSnippet,
      functionName: 'getStatus' as const,
      args: [BigInt(name.domain.labelhash)] as const,
    })),
  )

  for (const [index, name] of candidates.entries()) {
    const result = results[index]
    if (!result || result.status === 'failure') {
      ids.add(name.domain.id)
      failed?.add(name.domain.id)
      continue
    }
    if (result.result !== RESERVED_STATUS) ids.add(name.domain.id)
  }
  return ids
}

const frozenApprovalCandidates = (
  names: readonly ClassifiedName[],
): ClassifiedName[] =>
  names.filter(
    (n) =>
      n.action === 'migrate' &&
      (n.tokenType === 'locked-2ld' || n.tokenType === 'locked-child') &&
      hasFuse(n.fuses, FUSES.CANNOT_APPROVE),
  )

type CopyRouteState = {
  readonly blocked: boolean
  readonly failed: boolean
}

const AVAILABLE_ROUTE: CopyRouteState = { blocked: false, failed: false }
const INVALID_ROUTE: CopyRouteState = { blocked: true, failed: true }

const immediateRouteState = (
  name: ClassifiedName,
  blockedIds: ReadonlySet<string>,
  failedIds: ReadonlySet<string>,
): CopyRouteState | null => {
  if (blockedIds.has(name.domain.id)) {
    return { blocked: true, failed: failedIds.has(name.domain.id) }
  }
  if (name.action === 'copy') return null

  const isCopyRoot =
    name.parentName?.toLowerCase() === 'eth' &&
    (name.tokenType === 'unwrapped' || name.tokenType === 'unlocked')
  return isCopyRoot ? AVAILABLE_ROUTE : INVALID_ROUTE
}

/**
 * Copy operations depend on every classified ancestor reaching V2 in the same
 * flow. Classification proves that route against the indexed snapshot; repeat
 * the dependency check after live eligibility reads so a descendant cannot
 * survive when its parent has since changed ownership or otherwise become
 * unavailable.
 *
 * `alreadyMigrated` is the existing result bucket for source/state that can no
 * longer be used. Structurally incomplete routes are additionally marked as
 * failed because they cannot be certified from the supplied live plan.
 */
const findBlockedCopyRoutes = (
  names: readonly ClassifiedName[],
  blockedIds: ReadonlySet<string>,
  failedIds: ReadonlySet<string>,
): { blocked: Set<string>; failed: Set<string> } => {
  const byName = new Map(
    names.map((name) => [name.domain.name.toLowerCase(), name] as const),
  )
  const routeStateByName = new Map<string, CopyRouteState>()
  const resolving = new Set<string>()

  const routeStateFor = (name: ClassifiedName): CopyRouteState => {
    const key = name.domain.name.toLowerCase()
    const cached = routeStateByName.get(key)
    if (cached) return cached

    if (resolving.has(key)) return INVALID_ROUTE
    resolving.add(key)

    const immediate = immediateRouteState(name, blockedIds, failedIds)
    let state = immediate
    if (!state) {
      const parentKey = name.parentName?.toLowerCase()
      const parent = parentKey ? byName.get(parentKey) : undefined
      state = parent ? routeStateFor(parent) : INVALID_ROUTE
    }

    resolving.delete(key)
    routeStateByName.set(key, state)
    return state
  }

  const blocked = new Set<string>()
  const failed = new Set<string>()
  for (const name of names) {
    if (name.action !== 'copy') continue
    const state = routeStateFor(name)
    if (state.blocked) blocked.add(name.domain.id)
    if (state.failed) failed.add(name.domain.id)
  }

  return { blocked, failed }
}

export const runEligibilityChecks = async (
  publicClient: PublicClient,
  names: ClassifiedName[],
  migrationOwner: Address,
): Promise<EligibilityResult> => {
  if (names.length === 0) {
    return {
      eligible: [],
      frozen: [],
      alreadyMigrated: [],
      notPremigrated: [],
      failed: [],
    }
  }

  const frozenCandidates = frozenApprovalCandidates(names)
  const failedIds = new Set<string>()

  const [migratedIds, frozenIds, notPremigratedIds] = await Promise.all([
    checkOwnership(publicClient, names, migrationOwner, failedIds),
    checkFrozenApproval(publicClient, frozenCandidates, failedIds),
    checkPremigrationReservation(publicClient, names, failedIds),
  ])

  const liveBlockedIds = new Set([
    ...migratedIds,
    ...frozenIds,
    ...notPremigratedIds,
  ])
  const blockedCopyRoutes = findBlockedCopyRoutes(
    names,
    liveBlockedIds,
    failedIds,
  )
  for (const id of blockedCopyRoutes.blocked) migratedIds.add(id)
  for (const id of blockedCopyRoutes.failed) failedIds.add(id)

  return {
    eligible: names.filter(
      (n) =>
        !frozenIds.has(n.domain.id) &&
        !migratedIds.has(n.domain.id) &&
        !notPremigratedIds.has(n.domain.id),
    ),
    frozen: names.filter((n) => frozenIds.has(n.domain.id)),
    alreadyMigrated: names.filter((n) => migratedIds.has(n.domain.id)),
    notPremigrated: names.filter((n) => notPremigratedIds.has(n.domain.id)),
    failed: names.filter((n) => failedIds.has(n.domain.id)),
  }
}
