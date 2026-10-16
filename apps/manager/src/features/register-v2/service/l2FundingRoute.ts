import type { L2BridgeRoute } from '@ens-apps/smart-account'
import type { Address } from 'viem'
import { chain, l2Sources } from '@/config'
import type { L2Source } from '@/l2Sources'
import { HCA_PAYMENT_TOKEN } from '@/lib/smart-account/useSmartAccountBalances'

export const findL2Source = (chainId: number): L2Source | undefined =>
  l2Sources.find((source) => source.chain.id === chainId)

/** Bridge `amountOut` of the registration's payment token into the owner's wallet. */
export const getL2FundingRoute = ({
  owner,
  source,
  amountOut,
}: {
  readonly owner: Address
  readonly source: L2Source
  readonly amountOut: bigint
}): L2BridgeRoute => ({
  owner,
  sourceChain: source.chain,
  sourceToken: source.usdc,
  targetChain: chain,
  targetToken: HCA_PAYMENT_TOKEN,
  amountOut,
})
