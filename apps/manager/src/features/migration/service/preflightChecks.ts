import type { Address, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import {
  BASE_REGISTRAR_ABI,
  ETH_REGISTRY_V2_ABI,
  NAME_WRAPPER_ABI,
  WRAPPER_REGISTRY_ABI,
} from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { batchedMulticall } from './batchedMulticall'
import { type ClassifiedName, FUSES, hasFuse, is2LD } from './classifyNames'

export type EligibilityResult = {
  eligible: ClassifiedName[]
  frozen: ClassifiedName[]
  alreadyMigrated: ClassifiedName[]
}

const V2_STATUS_REGISTERED = 2

export const checkOwnership = async (
  publicClient: PublicClient,
  names: readonly ClassifiedName[],
  migrationOwner: Address,
): Promise<Set<string>> => {
  const ids = new Set<string>()
  if (names.length === 0) return ids

  type Contract = Parameters<typeof batchedMulticall>[1][number]
  const contracts: Contract[] = names.map((name) =>
    name.tokenType === 'unwrapped'
      ? {
          address: V1_CONTRACTS.BaseRegistrar,
          abi: BASE_REGISTRAR_ABI,
          functionName: 'ownerOf' as const,
          args: [BigInt(name.domain.labelhash)] as const,
        }
      : {
          address: V1_CONTRACTS.NameWrapper,
          abi: NAME_WRAPPER_ABI,
          functionName: 'getData' as const,
          args: [BigInt(name.domain.id)] as const,
        },
  )

  const results = await batchedMulticall<
    Address | readonly [Address, number, bigint]
  >(publicClient, contracts)

  const expected = migrationOwner.toLowerCase()
  for (let i = 0; i < names.length; i++) {
    const name = names[i]!
    const r = results[i]
    if (!r || r.status === 'failure') {
      ids.add(name.domain.id)
      continue
    }
    const result = r.result
    const currentOwner = typeof result === 'string' ? result : result[0]
    if (currentOwner.toLowerCase() !== expected) {
      ids.add(name.domain.id)
    }
  }

  return ids
}

export const checkV2Status = async (
  publicClient: PublicClient,
  twoLDs: readonly ClassifiedName[],
): Promise<Set<string>> => {
  const ids = new Set<string>()
  if (twoLDs.length === 0) return ids

  const results = await batchedMulticall<number>(
    publicClient,
    twoLDs.map((name) => ({
      address: V2_CONTRACTS.ETHRegistry,
      abi: ETH_REGISTRY_V2_ABI,
      functionName: 'getStatus' as const,
      args: [BigInt(name.domain.labelhash)] as const,
    })),
  )

  for (let i = 0; i < twoLDs.length; i++) {
    const name = twoLDs[i]!
    const r = results[i]
    if (!r || r.status === 'failure') {
      console.warn(
        `[migration] v2-status check failed for ${name.domain.id}; treating as already migrated`,
      )
      ids.add(name.domain.id)
      continue
    }
    if (r.result === V2_STATUS_REGISTERED) {
      ids.add(name.domain.id)
    }
  }

  return ids
}

export const checkFrozenApproval = async (
  publicClient: PublicClient,
  candidates: readonly ClassifiedName[],
): Promise<Set<string>> => {
  const ids = new Set<string>()
  if (candidates.length === 0) return ids

  const results = await batchedMulticall<Address>(
    publicClient,
    candidates.map((name) => ({
      address: V1_CONTRACTS.NameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: 'getApproved' as const,
      args: [BigInt(name.domain.id)] as const,
    })),
  )

  for (let i = 0; i < candidates.length; i++) {
    const name = candidates[i]!
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
): Promise<EligibilityResult> => {
  if (names.length === 0) {
    return { eligible: [], frozen: [], alreadyMigrated: [] }
  }

  const twoLDs = names.filter(is2LD)
  const frozenCandidates = frozenApprovalCandidates(names)

  const [ownershipMigrated, v2Migrated, frozenIds] = await Promise.all([
    checkOwnership(publicClient, names, migrationOwner),
    checkV2Status(publicClient, twoLDs),
    checkFrozenApproval(publicClient, frozenCandidates),
  ])

  const migratedIds = new Set<string>([...ownershipMigrated, ...v2Migrated])

  return {
    eligible: names.filter(
      (n) => !frozenIds.has(n.domain.id) && !migratedIds.has(n.domain.id),
    ),
    frozen: names.filter((n) => frozenIds.has(n.domain.id)),
    alreadyMigrated: names.filter((n) => migratedIds.has(n.domain.id)),
  }
}

const getParentLabels = (name: ClassifiedName): string[] =>
  name.domain.name.split('.').slice(1, -1).reverse()

const PARENT_REGISTRY_RETRIES = 3
const PARENT_REGISTRY_RETRY_DELAYS_MS = [500, 4000] as const

const walkDeepRegistry = async (
  publicClient: PublicClient,
  start: Address,
  labels: readonly string[],
): Promise<Address> => {
  let registry: Address = start
  for (const label of labels) {
    const subregistry = (await readContract(publicClient, {
      address: registry,
      abi: WRAPPER_REGISTRY_ABI,
      functionName: 'getSubregistry',
      args: [label],
    })) as Address
    if (subregistry === zeroAddress) return zeroAddress
    registry = subregistry
  }
  return registry
}

const resolveParentRegistriesOnce = async (
  publicClient: PublicClient,
  lockedChildren: ReadonlyMap<string, readonly ClassifiedName[]>,
): Promise<Map<string, Address>> => {
  const entries = [...lockedChildren.entries()]
  const parentLabelsByGroup = entries.map(([, children]) => {
    const first = children[0]
    return first ? getParentLabels(first) : []
  })

  const firstHopLabels = parentLabelsByGroup.map((labels) => labels[0] ?? '')
  const firstHopResults = await batchedMulticall<Address>(
    publicClient,
    firstHopLabels.map((label) => ({
      address: V2_CONTRACTS.ETHRegistry,
      abi: ETH_REGISTRY_V2_ABI,
      functionName: 'getSubregistry' as const,
      args: [label] as const,
    })),
  )

  const resolved = await Promise.all(
    entries.map(async ([parentName], i): Promise<[string, Address]> => {
      const labels = parentLabelsByGroup[i]
      const firstHop = firstHopResults[i]

      if (!labels || !firstHop || firstHop.status === 'failure') {
        return [parentName, zeroAddress]
      }
      if (firstHop.result === zeroAddress) {
        return [parentName, zeroAddress]
      }
      if (labels.length <= 1) {
        return [parentName, firstHop.result]
      }

      const final = await walkDeepRegistry(
        publicClient,
        firstHop.result,
        labels.slice(1),
      )
      return [parentName, final]
    }),
  )

  return new Map(resolved)
}

export const resolveParentRegistries = async (
  publicClient: PublicClient,
  childNames: ReadonlyMap<string, readonly ClassifiedName[]>,
): Promise<Map<string, Address>> => {
  let registries = await resolveParentRegistriesOnce(publicClient, childNames)

  for (let attempt = 1; attempt < PARENT_REGISTRY_RETRIES; attempt++) {
    const unresolved = [...registries.entries()].filter(
      ([, addr]) => addr === zeroAddress,
    )
    if (unresolved.length === 0) return registries

    const delay =
      PARENT_REGISTRY_RETRY_DELAYS_MS[attempt - 1] ??
      PARENT_REGISTRY_RETRY_DELAYS_MS[
        PARENT_REGISTRY_RETRY_DELAYS_MS.length - 1
      ]!
    console.warn(
      `[migration] ${unresolved.length} parent registries unresolved, retrying in ${delay}ms (attempt ${attempt + 1}/${PARENT_REGISTRY_RETRIES})`,
    )
    await new Promise((resolve) => setTimeout(resolve, delay))
    registries = await resolveParentRegistriesOnce(publicClient, childNames)
  }

  return registries
}
