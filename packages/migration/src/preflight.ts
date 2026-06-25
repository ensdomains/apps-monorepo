import type { Address, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from './abis'
import { batchedMulticall } from './batchedMulticall'
import { DEFAULT_PREFLIGHT_ADDRESSES } from './chain'
import { type ClassifiedName, FUSES, hasFuse } from './classify'

/**
 * On-chain contract addresses the preflight checks read from. Defaults to the
 * active chain's {@link DEFAULT_PREFLIGHT_ADDRESSES}; pass an override only when
 * checking against a different chain.
 */
export type PreflightAddresses = {
  readonly baseRegistrar: Address
  readonly nameWrapper: Address
}

export type EligibilityResult = {
  eligible: ClassifiedName[]
  frozen: ClassifiedName[]
  alreadyMigrated: ClassifiedName[]
}

export const checkOwnership = async (
  publicClient: PublicClient,
  names: readonly ClassifiedName[],
  migrationOwner: Address,
  addresses: PreflightAddresses = DEFAULT_PREFLIGHT_ADDRESSES,
): Promise<Set<string>> => {
  const ids = new Set<string>()
  if (names.length === 0) return ids

  type Contract = Parameters<typeof batchedMulticall>[1][number]
  const contracts: Contract[] = names.map((name) =>
    name.tokenType === 'unwrapped'
      ? {
          address: addresses.baseRegistrar,
          abi: BASE_REGISTRAR_ABI,
          functionName: 'ownerOf' as const,
          args: [BigInt(name.domain.labelhash)] as const,
        }
      : {
          address: addresses.nameWrapper,
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
      continue
    }
    const result = r.result
    const isWrappedToken = typeof result !== 'string'
    const currentOwner = isWrappedToken ? result[0] : result
    if (isWrappedToken && result[2] <= nowSeconds) {
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
  addresses: PreflightAddresses = DEFAULT_PREFLIGHT_ADDRESSES,
): Promise<Set<string>> => {
  const ids = new Set<string>()
  if (candidates.length === 0) return ids

  const results = await batchedMulticall<Address>(
    publicClient,
    candidates.map((name) => ({
      address: addresses.nameWrapper,
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
      continue
    }
    if (r.result !== zeroAddress) {
      ids.add(name.domain.id)
    }
  }

  return ids
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
  addresses: PreflightAddresses = DEFAULT_PREFLIGHT_ADDRESSES,
): Promise<EligibilityResult> => {
  if (names.length === 0) {
    return { eligible: [], frozen: [], alreadyMigrated: [] }
  }

  const frozenCandidates = frozenApprovalCandidates(names)

  const [migratedIds, frozenIds] = await Promise.all([
    checkOwnership(publicClient, names, migrationOwner, addresses),
    checkFrozenApproval(publicClient, frozenCandidates, addresses),
  ])

  return {
    eligible: names.filter(
      (n) => !frozenIds.has(n.domain.id) && !migratedIds.has(n.domain.id),
    ),
    frozen: names.filter((n) => frozenIds.has(n.domain.id)),
    alreadyMigrated: names.filter((n) => migratedIds.has(n.domain.id)),
  }
}
