import type { Address, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { multicall, readContract } from 'viem/actions'
import {
  ETH_REGISTRY_V2_ABI,
  NAME_WRAPPER_ABI,
  WRAPPER_REGISTRY_ABI,
} from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { type ClassifiedName, FUSES, hasFuse, is2LD } from './classifyNames'

const PREFLIGHT_TIMEOUT = 8000
const MULTICALL_BATCH_SIZE = 100

type MulticallFailure = {
  status: 'failure'
  error: Error
  result: undefined
}

const MULTICALL_FAILURE: MulticallFailure = {
  status: 'failure',
  error: new Error('timeout'),
  result: undefined,
}

const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> => {
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ])
  } catch {
    return fallback
  }
}

const batchedMulticall = async <T>(
  publicClient: PublicClient,
  contracts: Parameters<typeof multicall>[1]['contracts'],
): Promise<({ status: 'success'; result: T } | MulticallFailure)[]> => {
  const chunks: (typeof contracts)[] = []
  for (let i = 0; i < contracts.length; i += MULTICALL_BATCH_SIZE) {
    chunks.push(contracts.slice(i, i + MULTICALL_BATCH_SIZE))
  }

  const chunkResults = await Promise.all(
    chunks.map((chunk) =>
      withTimeout(
        multicall(publicClient, { contracts: chunk, allowFailure: true }),
        PREFLIGHT_TIMEOUT,
        chunk.map(() => MULTICALL_FAILURE),
      ),
    ),
  )

  return chunkResults.flat() as (
    | {
        status: 'success'
        result: T
      }
    | MulticallFailure
  )[]
}

export const filterNotReserved = async (
  publicClient: PublicClient,
  names: ClassifiedName[],
): Promise<{ valid: ClassifiedName[]; notReserved: ClassifiedName[] }> => {
  const twoLDs = names.filter(is2LD)

  if (twoLDs.length === 0) {
    return { valid: names, notReserved: [] }
  }

  const results = await batchedMulticall<Address>(
    publicClient,
    twoLDs.map((name) => ({
      address: V2_CONTRACTS.ETHRegistry,
      abi: ETH_REGISTRY_V2_ABI,
      functionName: 'getResolver' as const,
      args: [name.label] as const,
    })),
  )

  const notReserved = twoLDs.filter((_, i) => {
    const r = results[i]
    if (!r || r.status === 'failure') return false
    return r.result === zeroAddress
  })

  if (notReserved.length === 0) {
    return { valid: names, notReserved: [] }
  }

  const notReservedIds = new Set(notReserved.map((n) => n.domain.id))
  const valid = names.filter((n) => !notReservedIds.has(n.domain.id))
  return { valid, notReserved }
}

export const filterFrozenApprovals = async (
  publicClient: PublicClient,
  names: ClassifiedName[],
): Promise<{ valid: ClassifiedName[]; frozen: ClassifiedName[] }> => {
  const locked = names.filter(
    (n) =>
      (n.tokenType === 'locked-2ld' || n.tokenType === 'locked-child') &&
      hasFuse(n.fuses, FUSES.CANNOT_APPROVE),
  )

  if (locked.length === 0) {
    return { valid: names, frozen: [] }
  }

  const approvedResults = await batchedMulticall<Address>(
    publicClient,
    locked.map((name) => ({
      address: V1_CONTRACTS.NameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: 'getApproved' as const,
      args: [BigInt(name.domain.id)] as const,
    })),
  )

  const frozen = locked.filter((_, i) => {
    const r = approvedResults[i]
    if (!r || r.status === 'failure') return false
    return r.result !== zeroAddress
  })

  if (frozen.length === 0) {
    return { valid: names, frozen: [] }
  }

  const frozenIds = new Set(frozen.map((n) => n.domain.id))
  const valid = names.filter((n) => !frozenIds.has(n.domain.id))
  return { valid, frozen }
}

export type PreFlightResult = {
  valid: ClassifiedName[]
  notReserved: ClassifiedName[]
  frozen: ClassifiedName[]
}

export const runPreFlightChecks = async (
  publicClient: PublicClient,
  names: ClassifiedName[],
): Promise<PreFlightResult> => {
  try {
    const reservedResult = await filterNotReserved(publicClient, names)
    const frozenResult = await filterFrozenApprovals(
      publicClient,
      reservedResult.valid,
    )

    return {
      valid: frozenResult.valid,
      notReserved: reservedResult.notReserved,
      frozen: frozenResult.frozen,
    }
  } catch (error) {
    console.warn(
      '[migration] Pre-flight checks failed, proceeding with all names:',
      error,
    )
    return { valid: names, notReserved: [], frozen: [] }
  }
}

// "sub.nick.eth" → ["nick"], "deep.sub.nick.eth" → ["nick", "sub"]
const getParentLabels = (name: ClassifiedName): string[] =>
  name.domain.name.split('.').slice(1, -1).reverse()

export const resolveParentRegistries = async (
  publicClient: PublicClient,
  lockedChildren: ReadonlyMap<string, readonly ClassifiedName[]>,
): Promise<Map<string, Address>> => {
  const entries = [...lockedChildren.entries()]
  const parentLabelsByGroup = entries.map(([, children]) => {
    const first = children[0]
    return first ? getParentLabels(first) : []
  })

  // Batch the first hop (ETHRegistry.getSubregistry) for all parents
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

  const registries = new Map<string, Address>()

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const labels = parentLabelsByGroup[i]
    if (!entry || !labels) continue
    const [parentName] = entry
    const firstHop = firstHopResults[i]

    if (!firstHop || firstHop.status === 'failure') {
      registries.set(parentName, zeroAddress)
      continue
    }

    if (firstHop.result === zeroAddress) {
      registries.set(parentName, zeroAddress)
      continue
    }

    // Single-level parent (e.g. sub.nick.eth → labels ["nick"])
    if (labels.length <= 1) {
      registries.set(parentName, firstHop.result)
      continue
    }

    // Deeper names: walk remaining levels sequentially from the first hop result
    let registry: Address = firstHop.result
    let resolved = true
    for (const label of labels.slice(1)) {
      const subregistry = await readContract(publicClient, {
        address: registry,
        abi: WRAPPER_REGISTRY_ABI,
        functionName: 'getSubregistry',
        args: [label],
      })
      if (subregistry === zeroAddress) {
        registries.set(parentName, zeroAddress)
        resolved = false
        break
      }
      registry = subregistry as Address
    }
    if (resolved) {
      registries.set(parentName, registry)
    }
  }

  return registries
}
