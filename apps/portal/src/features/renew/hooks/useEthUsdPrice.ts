import { useQuery } from '@tanstack/react-query'
import { type Address, formatEther } from 'viem'
import { usePublicClient } from 'wagmi'

// ENS-native ETH/USD oracle: `eth-usd.data.eth` resolves to a Chainlink-style
// aggregator whose `latestAnswer()` is the ETH price with 8 decimals. Same
// source ens-app-v3 uses for fiat display. Resolves on both mainnet and the
// portal's Sepolia chain; when it can't be read, USD display is simply skipped.
const ORACLE_ENS = 'eth-usd.data.eth'
const ORACLE_DECIMALS = 8n

const latestAnswerAbi = [
  {
    inputs: [],
    name: 'latestAnswer',
    outputs: [{ name: '', type: 'int256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

/**
 * Current ETH price in USD (8-decimal fixed point), or `undefined` while
 * loading or if the oracle can't be resolved/read.
 */
export const useEthUsdPrice = () => {
  const client = usePublicClient()

  return useQuery({
    queryKey: ['eth-usd-price'],
    // Price drift within a session is irrelevant for a display estimate.
    staleTime: 5 * 60 * 1000,
    enabled: !!client,
    queryFn: async (): Promise<bigint | null> => {
      if (!client) return null
      const address = await client.getEnsAddress({ name: ORACLE_ENS })
      if (!address) return null
      const answer = await client.readContract({
        address: address as Address,
        abi: latestAnswerAbi,
        functionName: 'latestAnswer',
      })
      return answer > 0n ? answer : null
    },
  })
}

/**
 * Formats a wei amount as a USD estimate using the oracle price, or `null` when
 * no price is available (caller should fall back to showing ETH only).
 */
export const formatWeiAsUsd = (
  wei: bigint,
  ethUsdPrice: bigint | null | undefined,
): string | null => {
  if (!ethUsdPrice) return null
  const usd =
    Number(formatEther(wei)) *
    (Number(ethUsdPrice) / Number(10n ** ORACLE_DECIMALS))
  return usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
