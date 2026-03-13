import { l2ReverseRegistrarNameForAddrSnippet } from '@ens-apps/l2-primary/L2ReverseRegistrar'
import type { ReverseRegistrarChainId } from '@ens-apps/l2-primary/reverseRegistrarChainIds'
import {
  getChainIdForReverseRegistrarChainId,
  getRegistrarAddress,
} from '@ens-apps/l2-primary/reverseRegistrarChainIds'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getChainContractAddress,
  registryResolverSnippet,
} from '@ensdomains/ensjs/contracts'
import { getAddressRecord, getName } from '@ensdomains/ensjs/public'
import { ok } from 'neverthrow'
import type { Address, Client, Transport } from 'viem'
import { readContract } from 'viem/actions'
import { namehash } from 'viem/ens'
import { getAction } from 'viem/utils'
import type { sepoliaWithEns } from '@/lib/wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'

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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

/** NameResolver.name(bytes32) - returns name for reverse node */
const nameResolverNameSnippet = [
  {
    inputs: [{ name: 'node', type: 'bytes32' }],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

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

/**
 * Direct on-chain read of L1 reverse record (bypasses Universal Resolver/CCIP).
 * Returns the name from the resolver for the reverse node, or null.
 */
async function getL1ReverseRecordDirect(
  client: EnsV1Client,
  address: Address,
): Promise<{ name: string; reverseResolverAddress: Address } | null> {
  const reverseNode = `${address.toLowerCase().slice(2)}.addr.reverse`
  const nodeHash = namehash(reverseNode)
  const registryAddress = getChainContractAddress({
    client,
    contract: 'ensRegistry',
  })
  const readContractAction = getAction(client, readContract, 'readContract')

  const resolverAddress = await readContractAction({
    address: registryAddress,
    abi: registryResolverSnippet,
    functionName: 'resolver',
    args: [nodeHash],
  })

  if (!resolverAddress || resolverAddress === ZERO_ADDRESS) {
    return null
  }

  const name = await readContractAction({
    address: resolverAddress,
    abi: nameResolverNameSnippet,
    functionName: 'name',
    args: [nodeHash],
  })

  if (!name || name === '') return null

  return { name, reverseResolverAddress: resolverAddress }
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
    const direct = await getL1ReverseRecordDirect(client, address)
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
  ) as 11155420 | 421614 | 84532 | 59141 | 534351

  const l2Client = wagmiConfig.getClient({ chainId })
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
