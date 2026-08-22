import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { permissionedRegistryGetStatusSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import type { Address, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { sepoliaWithEns } from '../chain'
import {
  BASE_REGISTRAR_ABI,
  ENS_REGISTRY_V1_ABI,
  NAME_WRAPPER_ABI,
} from '../contracts/abis'
import { batchedMulticall } from './batchedMulticall'
import { type ClassifiedName, FUSES, hasFuse } from './classifyNames'
import { GRACE_PERIOD_SECONDS } from './constants'

const BASE_REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensBaseRegistrarImplementation',
})
const NAME_WRAPPER = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensNameWrapper',
})
const ETH_REGISTRY_V2 = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})
const ENS_REGISTRY_V1 = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensLegacyRegistry',
})
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

export const checkOwnership = async (
  publicClient: PublicClient,
  names: readonly ClassifiedName[],
  migrationOwner: Address,
  failed?: Set<string>,
): Promise<Set<string>> => {
  const ids = new Set<string>()
  if (names.length === 0) return ids

  type Contract = Parameters<typeof batchedMulticall>[1][number]
  const contracts: Contract[] = names.map((name) =>
    name.tokenType === 'unwrapped'
      ? {
          address: BASE_REGISTRAR,
          abi: BASE_REGISTRAR_ABI,
          functionName: 'ownerOf' as const,
          args: [BigInt(name.domain.labelhash)] as const,
        }
      : {
          address: NAME_WRAPPER,
          abi: NAME_WRAPPER_ABI,
          functionName: 'getData' as const,
          args: [BigInt(name.domain.id)] as const,
        },
  )

  const results = await batchedMulticall<
    Address | readonly [Address, number, bigint]
  >(publicClient, contracts)

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
      !isWrappedTokenTransferable(result[1], result[2], nowSeconds)
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
  if (candidates.length === 0) return ids

  const results = await batchedMulticall<Address>(
    publicClient,
    candidates.map((name) => ({
      address: NAME_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'getApproved' as const,
      args: [BigInt(name.domain.id)] as const,
    })),
  )

  for (const [i, name] of candidates.entries()) {
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
      name.tokenType === 'unwrapped' ||
      name.tokenType === 'unlocked' ||
      name.tokenType === 'locked-2ld',
  )
  if (candidates.length === 0) return ids

  const results = await batchedMulticall<number>(
    publicClient,
    candidates.map((name) => ({
      address: ETH_REGISTRY_V2,
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

export type LiveManagerResult = {
  /** domain id → live manager, or `null` when the registrant holds the role itself. */
  readonly managers: ReadonlyMap<string, Address | null>
  /** domain ids whose live manager could not be read. */
  readonly unreadable: ReadonlySet<string>
}

/**
 * Re-derive each name's V1 manager from the **live** legacy registry.
 *
 * `classifyName` takes `managerAddress` from the V1 subgraph's `domain.owner.id`, and the
 * migration plan turns that address into a real privilege: `grantRoles(name,
 * ROLE_SET_RESOLVER, managerAddress)` on the V2 registry. An index is not an authority —
 * it reports whoever held the role when it last synced. After a `BaseRegistrar.reclaim`
 * the two disagree for as long as indexing lags (widened by the five-minute client cache),
 * and granting from the stale value hands resolver control of the name to an address the
 * registrant already revoked.
 *
 * So every candidate address is confirmed against `ENSRegistry.owner(node)` before it can
 * become a grant. Only names the snapshot claims *have* a manager are read: when it
 * reports none the plan appends no grant, and there is no authorization to check.
 *
 * Fails closed. An unreadable name is reported in `unreadable` and dropped from the
 * eligible set rather than migrated on unverified data — the alternative is granting a
 * privilege we could not confirm.
 */
export const checkLiveManagers = async (
  publicClient: PublicClient,
  names: readonly ClassifiedName[],
  failed?: Set<string>,
): Promise<LiveManagerResult> => {
  const managers = new Map<string, Address | null>()
  const unreadable = new Set<string>()

  const candidates = names.filter((name) => name.managerAddress !== null)
  if (candidates.length === 0) return { managers, unreadable }

  const results = await batchedMulticall<Address>(
    publicClient,
    candidates.map((name) => ({
      address: ENS_REGISTRY_V1,
      abi: ENS_REGISTRY_V1_ABI,
      functionName: 'owner' as const,
      args: [name.domain.id as `0x${string}`] as const,
    })),
  )

  for (const [index, name] of candidates.entries()) {
    const result = results[index]
    if (!result || result.status === 'failure') {
      console.warn(
        `[migration] live V1 manager read failed for ${name.domain.id}; ` +
          'refusing to migrate on unverified manager data',
      )
      unreadable.add(name.domain.id)
      failed?.add(name.domain.id)
      continue
    }
    // Mirrors `classifyName`: the role is only a *delegation* when it sits with someone
    // other than the registrant, and only then does the plan restore it.
    const liveOwner = result.result
    managers.set(
      name.domain.id,
      liveOwner.toLowerCase() === name.tokenHolder.toLowerCase()
        ? null
        : liveOwner,
    )
  }

  return { managers, unreadable }
}

/** Replace a name's snapshot-derived manager with the live one. */
const withLiveManager = (
  name: ClassifiedName,
  managers: ReadonlyMap<string, Address | null>,
): ClassifiedName => {
  if (!managers.has(name.domain.id)) return name
  const live = managers.get(name.domain.id) ?? null
  if (live === name.managerAddress) return name
  if (live?.toLowerCase() === name.managerAddress?.toLowerCase()) return name
  console.warn(
    `[migration] ${name.domain.name}: subgraph reported manager ` +
      `${name.managerAddress}, live registry says ${live ?? 'none'} — using live`,
  )
  return { ...name, managerAddress: live }
}

/**
 * Return `names` with every manager re-derived from the live legacy registry.
 *
 * Call this before building a migration plan: the plan converts `managerAddress` into a
 * real `grantRoles` call, so it must never be built from the subgraph's copy.
 *
 * Throws when a manager cannot be read. A plan that grants a privilege we could not
 * confirm is worse than a flow the user has to retry — and unlike the eligibility path
 * there is no per-name bucket here to drop the name into.
 */
export const resolveLiveManagers = async (
  publicClient: PublicClient,
  names: readonly ClassifiedName[],
): Promise<ClassifiedName[]> => {
  const { managers, unreadable } = await checkLiveManagers(publicClient, names)
  if (unreadable.size > 0) {
    throw new Error(
      `Could not read the live V1 manager for ${[...unreadable].join(', ')} — ` +
        'refusing to build a migration that grants roles from unverified data.',
    )
  }
  return names.map((name) => withLiveManager(name, managers))
}

const frozenApprovalCandidates = (
  names: readonly ClassifiedName[],
): ClassifiedName[] =>
  names.filter(
    (n) =>
      (n.tokenType === 'locked-2ld' || n.tokenType === 'locked-child') &&
      hasFuse(n.fuses, FUSES.CANNOT_APPROVE),
  )

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

  const [migratedIds, frozenIds, notPremigratedIds, liveManagers] =
    await Promise.all([
      checkOwnership(publicClient, names, migrationOwner, failedIds),
      checkFrozenApproval(publicClient, frozenCandidates, failedIds),
      checkPremigrationReservation(publicClient, names, failedIds),
      checkLiveManagers(publicClient, names, failedIds),
    ])

  return {
    // Eligible names carry the LIVE manager, never the subgraph's copy — it is about to
    // become an on-chain role grant.
    eligible: names
      .filter(
        (n) =>
          !frozenIds.has(n.domain.id) &&
          !migratedIds.has(n.domain.id) &&
          !notPremigratedIds.has(n.domain.id) &&
          !liveManagers.unreadable.has(n.domain.id),
      )
      .map((n) => withLiveManager(n, liveManagers.managers)),
    frozen: names.filter((n) => frozenIds.has(n.domain.id)),
    alreadyMigrated: names.filter((n) => migratedIds.has(n.domain.id)),
    notPremigrated: names.filter((n) => notPremigratedIds.has(n.domain.id)),
    failed: names.filter((n) => failedIds.has(n.domain.id)),
  }
}
