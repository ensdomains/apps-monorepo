import {
  getChainIdForReverseRegistrarChainId,
  getRegistrarAddress,
  l2ReverseRegistrarNameForAddrSnippet,
  type ReverseRegistrarChainId,
} from '@ens-apps/l2-primary/v1'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getAddressRecord,
  getName,
  getReverseRecordFromRegistry,
} from '@ensdomains/ensjs/public'
import { ok } from 'neverthrow'
import type { Address, Client, Transport } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import type { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { l2WagmiConfig } from '@/lib/wagmiL2'

type EnsV1Client = Client<Transport, typeof sepoliaWithEns>

export type ReverseResolutionResult = {
  reverseRegistrarChainId: number
  label: string
  icon: string
  name: string | null
  reverseResolverAddress: Address | null
  resolverAddress: Address | null
  normalized: boolean
  forwardMatch: boolean
  defaultName: string | null
}

type Network = {
  reverseRegistrarChainId: number
  label: string
  icon: string
}

const REVERSE_RESOLUTION_NETWORK = 'sepolia' as const

function createEmptyResult(network: Network): ReverseResolutionResult {
  return {
    ...network,
    name: null,
    reverseResolverAddress: null,
    resolverAddress: null,
    normalized: true,
    forwardMatch: false,
    defaultName: null,
  }
}

async function getL1ReverseRecord(
  client: EnsV1Client,
  address: Address,
  network: Network,
): Promise<ReverseResolutionResult> {
  let nameResult = await getName(client, {
    address,
    coinType: 60,
    allowMismatch: true,
  })

  if (!nameResult) {
    const direct = await getReverseRecordFromRegistry(client, { address })

    if (direct) {
      nameResult = {
        name: direct.name,
        match: false,
        normalized: true,
        reverseResolverAddress: direct.reverseResolverAddress,
        resolverAddress: null,
      }
    }
  }

  return {
    ...network,
    name: nameResult?.name ?? null,
    reverseResolverAddress: nameResult?.reverseResolverAddress ?? null,
    resolverAddress: nameResult?.resolverAddress ?? null,
    normalized: nameResult?.normalized ?? true,
    forwardMatch: nameResult?.match ?? false,
    defaultName: null,
  }
}

async function getL2ReverseRecord(
  l1Client: EnsV1Client,
  address: Address,
  network: Network,
): Promise<ReverseResolutionResult> {
  const registrarAddress = getRegistrarAddress(
    network.reverseRegistrarChainId as ReverseRegistrarChainId,
    REVERSE_RESOLUTION_NETWORK,
  )

  if (!registrarAddress) {
    return createEmptyResult(network)
  }

  const chainId = getChainIdForReverseRegistrarChainId(
    network.reverseRegistrarChainId as ReverseRegistrarChainId,
    REVERSE_RESOLUTION_NETWORK,
  )

  // L2 chains live in a separate, local-only wagmi config so we don't have
  // to pollute the explorer's global Sepolia-only config. See `@/lib/wagmiL2`.
  let l2Client: ReturnType<typeof l2WagmiConfig.getClient>
  try {
    l2Client = l2WagmiConfig.getClient({
      chainId: chainId as (typeof l2WagmiConfig)['chains'][number]['id'],
    })
  } catch {
    return createEmptyResult(network)
  }
  if (!l2Client) {
    return createEmptyResult(network)
  }

  const readContractAction = getAction(l2Client, readContract, 'readContract')
  const name = await readContractAction({
    address: registrarAddress,
    abi: l2ReverseRegistrarNameForAddrSnippet,
    functionName: 'nameForAddr',
    args: [address],
  })

  if (!name || name === '') {
    return createEmptyResult(network)
  }

  let forwardMatch = true
  try {
    const addrRecord = await getAddressRecord(l1Client, { name })
    forwardMatch =
      !!addrRecord?.value &&
      addrRecord.value.toLowerCase() === address.toLowerCase()
  } catch {
    forwardMatch = false
  }

  return {
    ...network,
    name,
    reverseResolverAddress: null,
    resolverAddress: null,
    normalized: true,
    forwardMatch,
    defaultName: null,
  }
}

async function getReverseRecordForNetwork(
  l1Client: EnsV1Client,
  address: Address,
  network: Network,
): Promise<ReverseResolutionResult> {
  const isL1 =
    network.reverseRegistrarChainId === 60 ||
    network.reverseRegistrarChainId === 1

  if (isL1) {
    return getL1ReverseRecord(l1Client, address, network)
  }

  return getL2ReverseRecord(l1Client, address, network)
}

const getReverseResolution = ResultFn(async function* ({
  address,
  networks,
}: {
  address: Address
  networks: Network[]
}) {
  const l1Client = yield* safeGetClient()

  const results = await Promise.allSettled(
    networks.map((network) =>
      getReverseRecordForNetwork(l1Client, address, network),
    ),
  )

  const resolvedResults: ReverseResolutionResult[] = results.map(
    (result, index) => {
      if (result.status === 'fulfilled') return result.value
      console.error(
        `[getReverseResolution] Error for ${networks[index].label}:`,
        result.reason,
      )
      return createEmptyResult(networks[index])
    },
  )

  const defaultName =
    resolvedResults.find((r) => r.reverseRegistrarChainId === 60)?.name ?? null

  return ok(resolvedResults.map((r) => ({ ...r, defaultName })))
})

const getReverseResolutionQueryKey = createQueryKey<
  'get-reverse-resolution',
  { address: Address }
>('get-reverse-resolution')

export const getReverseResolutionQueryOptions = (params: {
  address: Address
  networks: Network[]
}) =>
  resultQueryOptions({
    queryKey: getReverseResolutionQueryKey({
      address: params.address,
    }),
    queryFn: () => getReverseResolution(params),
  })
