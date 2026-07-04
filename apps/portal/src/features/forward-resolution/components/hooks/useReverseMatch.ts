import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import type { Address, Client, Transport } from 'viem'
import { getEnsName } from 'viem/actions'
import type { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'

type EnsV1Client = Client<Transport, typeof sepoliaWithEns>

/** A forward-resolved address to reverse-check against the name. */
export type ReverseMatchNetwork = {
  coinType: number
  address: Address
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

/**
 * Reverse-resolve an address for a coin type. viem's `getEnsName` runs the full
 * ENSIP-19 reverse resolution on-chain via the UniversalResolver's
 * `reverseWithGateways(address, coinType)` — the chain-specific primary for an
 * L2 coin type, falling back to `default.reverse` (`0x80000000`) when unset —
 * so we don't read L2 reverse registrars or handle the fallback ourselves. It
 * returns `null` when there's no verified primary for that coin type.
 */
async function getReverseName(
  client: EnsV1Client,
  address: Address,
  coinType: number,
): Promise<string | null> {
  return getEnsName(client, { address, coinType: BigInt(coinType) })
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
      const reverseName = await getReverseName(
        l1Client,
        network.address,
        network.coinType,
      )
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
