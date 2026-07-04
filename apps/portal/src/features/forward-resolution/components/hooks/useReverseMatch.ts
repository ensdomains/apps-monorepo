import {
  getChainIdForReverseRegistrarChainId,
  getRegistrarAddress,
  l2ReverseRegistrarNameForAddrSnippet,
  type ReverseRegistrarChainId,
} from '@ens-apps/l2-primary/v1'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getName } from '@ensdomains/ensjs/public'
import { ok } from 'neverthrow'
import type { Address, Client, Transport } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import type { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { l2WagmiConfig } from '@/lib/wagmiL2'
import { DEFAULT_COIN_TYPE } from '../AddressResolution/networks'

type EnsV1Client = Client<Transport, typeof sepoliaWithEns>

// L2 reverse reads run against Sepolia, mirroring the reverse-resolution
// feature. See `useReverseResolution` for the shared machinery.
const REVERSE_RESOLUTION_NETWORK = 'sepolia' as const

/** A forward-resolved address to reverse-check against the name. */
export type ReverseMatchNetwork = {
  coinType: number
  address: Address
  /** L2 chain id — present only for L2 rows. */
  l2ChainId?: ReverseRegistrarChainId
}

export type ReverseMatchResult = {
  coinType: number
  /** Whether the resolved address reverse-resolves back to this name. */
  reverseMatch: boolean
  /** The name the resolved address reverse-resolves to, if any. */
  reverseName: string | null
}

function namesEqual(reverseName: string | null | undefined, name: string) {
  return !!reverseName && reverseName.toLowerCase() === name.toLowerCase()
}

/** Read the name an address reverse-resolves to via L1 `getName` for a coin type. */
async function getL1ReverseName(
  client: EnsV1Client,
  address: Address,
  coinType: number,
): Promise<string | null> {
  const result = await getName(client, {
    address,
    coinType,
    allowMismatch: true,
  })
  return result?.name ?? null
}

/** Read an address's chain-specific reverse name from an L2 reverse registrar. */
async function getL2ReverseName(
  address: Address,
  l2ChainId: ReverseRegistrarChainId,
): Promise<string | null> {
  const registrarAddress = getRegistrarAddress(
    l2ChainId,
    REVERSE_RESOLUTION_NETWORK,
  )
  if (!registrarAddress) return null

  const chainId = getChainIdForReverseRegistrarChainId(
    l2ChainId,
    REVERSE_RESOLUTION_NETWORK,
  )

  let l2Client: ReturnType<typeof l2WagmiConfig.getClient>
  try {
    l2Client = l2WagmiConfig.getClient({
      chainId: chainId as (typeof l2WagmiConfig)['chains'][number]['id'],
    })
  } catch {
    return null
  }
  if (!l2Client) return null

  const readContractAction = getAction(l2Client, readContract, 'readContract')
  const name = await readContractAction({
    address: registrarAddress,
    abi: l2ReverseRegistrarNameForAddrSnippet,
    functionName: 'nameForAddr',
    args: [address],
  })
  return name || null
}

async function resolveReverseName(
  l1Client: EnsV1Client,
  network: ReverseMatchNetwork,
): Promise<string | null> {
  // L2: the chain-specific reverse record, falling back to `default.reverse`
  // (coin type `0x80000000`) per ENSIP-19.
  if (network.l2ChainId != null) {
    const l2Name = await getL2ReverseName(network.address, network.l2ChainId)
    return (
      l2Name ??
      (await getL1ReverseName(l1Client, network.address, DEFAULT_COIN_TYPE))
    )
  }
  // Default (`0x80000000` → default.reverse) or Mainnet (60 → addr.reverse).
  return getL1ReverseName(l1Client, network.address, network.coinType)
}

const getReverseMatches = ResultFn(async function* ({
  name,
  networks,
}: {
  name: string
  networks: ReverseMatchNetwork[]
}) {
  const l1Client = yield* safeGetClient()

  const results = await Promise.allSettled(
    networks.map(async (network) => {
      const reverseName = await resolveReverseName(l1Client, network)
      return {
        coinType: network.coinType,
        reverseName,
        reverseMatch: namesEqual(reverseName, name),
      }
    }),
  )

  const resolved: ReverseMatchResult[] = results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value
    console.error(
      `[getReverseMatches] Error for coin ${networks[index].coinType}:`,
      result.reason,
    )
    return {
      coinType: networks[index].coinType,
      reverseMatch: false,
      reverseName: null,
    }
  })

  return ok(resolved)
})

const getReverseMatchesQueryKey = createQueryKey<
  'get-reverse-matches',
  { name: string; addresses: string }
>('get-reverse-matches')

export const getReverseMatchesQueryOptions = ({
  name,
  networks,
}: {
  name: string
  networks: ReverseMatchNetwork[]
}) =>
  resultQueryOptions({
    queryKey: getReverseMatchesQueryKey({
      name,
      addresses: networks.map((n) => `${n.coinType}:${n.address}`).join(','),
    }),
    queryFn: () => getReverseMatches({ name, networks }),
    enabled: networks.length > 0,
  })
