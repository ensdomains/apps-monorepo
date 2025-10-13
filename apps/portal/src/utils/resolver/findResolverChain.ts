import type { Address } from 'viem'
import { wagmiConfig } from '@/lib/wagmi'

const { chains } = wagmiConfig

export const findResolverChain = (resolverAddress: Address) => {
  return chains.find((chain) =>
    Object.values(chain.contracts as Record<number, Address>).includes(
      resolverAddress,
    ),
  )
}
