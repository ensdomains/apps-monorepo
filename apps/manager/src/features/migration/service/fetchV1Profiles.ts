import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { Address, Hex, PublicClient } from 'viem'
import { PERMISSIONED_RESOLVER_ABI } from '../contracts/abis'
import { getV1ProfileKeys } from './v1SubgraphClient'

const PROFILE_MULTICALL_CHUNK = 700
const PROFILE_MULTICALL_CONCURRENCY = 6

type ProfileMulticallResult = {
  status: 'success' | 'failure'
  result?: unknown
}

const executeMulticallChunks = async (
  publicClient: PublicClient,
  args: {
    address: Address
    abi: typeof PERMISSIONED_RESOLVER_ABI
    functionName: 'text' | 'addr'
    args: readonly unknown[]
  }[],
): Promise<ProfileMulticallResult[]> => {
  const chunks: (typeof args)[] = []
  for (let i = 0; i < args.length; i += PROFILE_MULTICALL_CHUNK) {
    chunks.push(args.slice(i, i + PROFILE_MULTICALL_CHUNK))
  }
  const chunkResults: ProfileMulticallResult[][] = new Array(chunks.length)
  let cursor = 0
  const runWorker = async (): Promise<void> => {
    while (true) {
      const index = cursor++
      const chunk = chunks[index]
      if (!chunk) return
      chunkResults[index] = (await publicClient.multicall({
        contracts: chunk,
        allowFailure: true,
        batchSize: 0,
      })) as ProfileMulticallResult[]
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

export class ProfileFetchError extends TaggedError('ProfileFetchError')<{
  cause: unknown
  phase: 'subgraph' | 'onchain'
}> {}

export type Profile = {
  texts: readonly { key: string; value: string }[]
  addresses: readonly { coinType: bigint; value: Hex }[]
}

type NameForFetch = {
  nodeHex: Hex
  v1ResolverAddress: Address
}

export const profileMapKey = (nodeHex: Hex): Hex => nodeHex.toLowerCase() as Hex

export const fetchV1Profiles = async (params: {
  names: readonly NameForFetch[]
  publicClient: PublicClient
}): Promise<Map<Hex, Profile>> => {
  const { names, publicClient } = params
  const out = new Map<Hex, Profile>()
  if (names.length === 0) return out

  const byNode = new Map<Hex, NameForFetch>(
    names.map((n) => [profileMapKey(n.nodeHex), n]),
  )
  const ids = [...byNode.keys()]

  const keyEntries = (await getV1ProfileKeys(ids)).match(
    (value) => value,
    (error) => {
      throw new ProfileFetchError({ cause: error, phase: 'subgraph' })
    },
  )

  type Call =
    | { name: NameForFetch; kind: 'text'; key: string }
    | {
        name: NameForFetch
        kind: 'addr'
        coinType: bigint
      }

  const calls: Call[] = []
  const multicallArgs: {
    address: Address
    abi: typeof PERMISSIONED_RESOLVER_ABI
    functionName: 'text' | 'addr'
    args: readonly unknown[]
  }[] = []

  for (const entry of keyEntries) {
    const name = byNode.get(profileMapKey(entry.id as Hex))
    if (!name) continue
    for (const key of entry.texts) {
      calls.push({ name, kind: 'text', key })
      multicallArgs.push({
        address: name.v1ResolverAddress,
        abi: PERMISSIONED_RESOLVER_ABI,
        functionName: 'text',
        args: [name.nodeHex, key],
      })
    }
    for (const ct of entry.coinTypes) {
      const coinType = BigInt(ct)
      calls.push({ name, kind: 'addr', coinType })
      multicallArgs.push({
        address: name.v1ResolverAddress,
        abi: PERMISSIONED_RESOLVER_ABI,
        functionName: 'addr',
        args: [name.nodeHex, coinType],
      })
    }
  }

  if (multicallArgs.length === 0) {
    for (const [, name] of byNode) {
      out.set(profileMapKey(name.nodeHex), { texts: [], addresses: [] })
    }
    return out
  }

  const results = await executeMulticallChunks(publicClient, multicallArgs)

  for (const [, name] of byNode) {
    out.set(profileMapKey(name.nodeHex), { texts: [], addresses: [] })
  }

  for (const [i, call] of calls.entries()) {
    const res = results[i]
    if (!res || res.status !== 'success') continue
    const bucket = out.get(profileMapKey(call.name.nodeHex))
    if (!bucket) continue
    if (call.kind === 'text') {
      const value = res.result as string
      if (value && value.length > 0) {
        bucket.texts = [...bucket.texts, { key: call.key, value }]
      }
    } else {
      const value = res.result as Hex
      if (value && value !== '0x') {
        bucket.addresses = [
          ...bucket.addresses,
          { coinType: call.coinType, value },
        ]
      }
    }
  }

  return out
}
