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

const PREFLIGHT_TIMEOUT_MS = 8000
const MULTICALL_BATCH_SIZE = 100

type MulticallFailure = {
  status: 'failure'
  error: Error
  result: undefined
}

const preflightTimeoutError = (ms: number): Error =>
  Object.assign(new Error(`Pre-flight RPC call timed out after ${ms}ms`), {
    name: 'PreflightTimeoutError',
    timeoutMs: ms,
  })

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(preflightTimeoutError(ms)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
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
        PREFLIGHT_TIMEOUT_MS,
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
  const [reservedResult, frozenResult] = await Promise.all([
    filterNotReserved(publicClient, names),
    filterFrozenApprovals(publicClient, names),
  ])

  const excluded = new Set<string>([
    ...reservedResult.notReserved.map((n) => n.domain.id),
    ...frozenResult.frozen.map((n) => n.domain.id),
  ])

  return {
    valid: names.filter((n) => !excluded.has(n.domain.id)),
    notReserved: reservedResult.notReserved,
    frozen: frozenResult.frozen,
  }
}

const getParentLabels = (name: ClassifiedName): string[] =>
  name.domain.name.split('.').slice(1, -1).reverse()

const PARENT_REGISTRY_RETRIES = 3
const PARENT_REGISTRY_RETRY_DELAY = 4000

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
  for (let attempt = 0; attempt <= PARENT_REGISTRY_RETRIES; attempt++) {
    const registries = await resolveParentRegistriesOnce(
      publicClient,
      childNames,
    )

    const unresolved = [...registries.entries()].filter(
      ([, addr]) => addr === zeroAddress,
    )

    if (unresolved.length === 0 || attempt === PARENT_REGISTRY_RETRIES) {
      return registries
    }

    console.warn(
      `[migration] ${unresolved.length} parent registries unresolved, retrying in ${PARENT_REGISTRY_RETRY_DELAY}ms (attempt ${attempt + 1}/${PARENT_REGISTRY_RETRIES})`,
    )
    await new Promise((resolve) =>
      setTimeout(resolve, PARENT_REGISTRY_RETRY_DELAY),
    )
  }

  return resolveParentRegistriesOnce(publicClient, childNames)
}
