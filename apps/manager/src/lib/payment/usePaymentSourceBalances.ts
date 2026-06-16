'use client'

import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { type Address, type Client, erc20Abi, formatUnits } from 'viem'
import { readContract } from 'viem/actions'
import {
  BASE_SEPOLIA_RPC_URL,
  baseSepoliaPublicClient,
  publicClient,
} from '@/lib/wagmi'
import {
  BASE_SEPOLIA_CHAIN_ID,
  getPaymentSources,
  type PaymentSource,
} from './crossChainSources'

/**
 * A payment source augmented with the owner's on-chain balance of the source
 * token (on the source chain). Balances are read per source chain: Sepolia
 * sources via the app's main public client, Base Sepolia sources via a
 * dedicated L2 client. The owner is always the EOA — the registrar pulls
 * payment from there, and for cross-chain the bridged funds also land there.
 */
export interface PaymentSourceBalance extends PaymentSource {
  /** Raw balance in token units (as a string for stable query serialization). */
  balance: string
  /** `${formatted} ${symbol}` for display. */
  formattedBalance: string
}

// The two public clients carry different Chain generics; widen to the base
// `Client` so a single `readContract` call site accepts either.
function clientForChain(chainId: number): Client {
  return chainId === BASE_SEPOLIA_CHAIN_ID
    ? (baseSepoliaPublicClient as unknown as Client)
    : (publicClient as unknown as Client)
}

interface UsePaymentSourceBalancesResult {
  readonly paymentSources: PaymentSourceBalance[]
  readonly isLoading: boolean
}

/**
 * Read balances for every available payment source for the given owner.
 *
 * Each source is read against its own source chain so L1 and L2 stable
 * balances are reflected independently — matching the token×chain rows in the
 * "Select coin" picker.
 */
export function usePaymentSourceBalances(
  ownerAddress: Address | null,
): UsePaymentSourceBalancesResult {
  const sources = getPaymentSources()

  const { data: paymentSources = [], isLoading } = useQuery({
    queryKey: $qk({
      $scope: 'wallet',
      $action: 'paymentSourceBalances',
      address: ownerAddress,
      // Refetch if the available source set changes (e.g. flag toggle).
      sources: sources.map((s) => s.id).join(','),
      // Base RPC override participates in the key so client swaps refetch.
      baseRpc: BASE_SEPOLIA_RPC_URL,
    }),
    queryFn: async (): Promise<PaymentSourceBalance[]> => {
      if (!ownerAddress) return []

      // Read each source's balance independently. A failed read (e.g. an L2
      // RPC hiccup) must NOT drop the source from the list — the row still
      // renders with a 0 balance so the user can see it's an option (and a
      // later refetch can fill the balance in). Dropping it would make the
      // L2 option silently vanish whenever the L2 RPC is briefly unavailable.
      return Promise.all(
        sources.map(async (source): Promise<PaymentSourceBalance> => {
          try {
            const balance = (await readContract(
              clientForChain(source.sourceChainId),
              {
                address: source.sourceTokenAddress,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [ownerAddress],
              },
            )) as bigint

            return {
              ...source,
              balance: balance.toString(),
              formattedBalance: `${formatUnits(balance, source.decimals)} ${source.symbol}`,
            }
          } catch {
            return {
              ...source,
              balance: '0',
              formattedBalance: `0 ${source.symbol}`,
            }
          }
        }),
      )
    },
    enabled: !!ownerAddress,
    refetchInterval: 30_000,
  })

  return { paymentSources, isLoading }
}
