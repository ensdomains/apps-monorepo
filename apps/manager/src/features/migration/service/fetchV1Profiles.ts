import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { Address, Hex, PublicClient } from 'viem'
import type { PERMISSIONED_RESOLVER_ABI } from '../contracts/abis'
import {
  buildProfileMulticallPlan,
  indexNamesByNode,
  initEmptyProfileBuckets,
  type MulticallContract,
  type MulticallResult,
  mergeMulticallResultsIntoProfiles,
  type NameForFetch,
} from './fetchV1Profiles.helpers'
import { getV1ProfileKeys, type V1ProfileKeys } from './v1SubgraphClient'

const PROFILE_MULTICALL_CHUNK = 700
const PROFILE_MULTICALL_CONCURRENCY = 6

export type { NameForFetch } from './fetchV1Profiles.helpers'
export { profileMapKey } from './fetchV1Profiles.helpers'

export class ProfileFetchError extends TaggedError('ProfileFetchError')<{
  cause: unknown
  phase: 'subgraph' | 'onchain'
}> {}

export type Profile = {
  texts: readonly { key: string; value: string }[]
  addresses: readonly { coinType: bigint; value: Hex }[]
}

const executeMulticallChunks = async (
  publicClient: PublicClient,
  contracts: readonly MulticallContract[],
): Promise<MulticallResult[]> => {
  const chunks: (typeof contracts)[] = []
  for (let i = 0; i < contracts.length; i += PROFILE_MULTICALL_CHUNK) {
    chunks.push(contracts.slice(i, i + PROFILE_MULTICALL_CHUNK))
  }
  const chunkResults: MulticallResult[][] = new Array(chunks.length)
  let cursor = 0
  const runWorker = async (): Promise<void> => {
    while (true) {
      const index = cursor++
      const chunk = chunks[index]
      if (!chunk) return
      chunkResults[index] = (await publicClient.multicall({
        contracts: [...chunk] as {
          address: Address
          abi: typeof PERMISSIONED_RESOLVER_ABI
          functionName: 'text' | 'addr'
          args: readonly unknown[]
        }[],
        allowFailure: true,
        batchSize: 0,
      })) as MulticallResult[]
    }
  }
  try {
    const workerCount = Math.min(PROFILE_MULTICALL_CONCURRENCY, chunks.length)
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  } catch (cause) {
    throw new ProfileFetchError({ cause, phase: 'onchain' })
  }
  return chunkResults.flat()
}

export const fetchV1Profiles = async (params: {
  names: readonly NameForFetch[]
  publicClient: PublicClient
  profileKeys?: readonly V1ProfileKeys[]
}): Promise<Map<Hex, Profile>> => {
  const { names, publicClient, profileKeys } = params
  if (names.length === 0) return new Map()

  const byNode = indexNamesByNode(names)

  const keyEntries =
    profileKeys ??
    (await getV1ProfileKeys([...byNode.keys()])).match(
      (value) => value,
      (error) => {
        throw new ProfileFetchError({ cause: error, phase: 'subgraph' })
      },
    )

  const { calls, contracts } = buildProfileMulticallPlan(keyEntries, byNode)
  const buckets = initEmptyProfileBuckets(byNode)
  if (contracts.length === 0) return buckets

  const results = await executeMulticallChunks(publicClient, contracts)
  return mergeMulticallResultsIntoProfiles({ buckets, calls, results })
}
