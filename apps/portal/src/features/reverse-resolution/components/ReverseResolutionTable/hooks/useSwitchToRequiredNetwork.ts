import type { CoinType } from '@ens-apps/l2-primary/chains'
import { getChainIdForCoinType } from '@ens-apps/l2-primary/chains'
import { useAccount, useSwitchChain } from 'wagmi'

export type UseNetworkSwitchingParams = {
  coinType: CoinType
  isTestnet: boolean
}

export function useSwitchToRequiredNetwork({
  coinType,
  isTestnet,
}: UseNetworkSwitchingParams) {
  const { chain } = useAccount()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()

  const requiredChainId = getChainIdForCoinType(coinType, isTestnet)
  const isWrongNetwork = chain?.id !== requiredChainId

  const getSwitchToRequiredNetworkRequest = () => ({
    chainId: requiredChainId,
  })

  return {
    isWrongNetwork,
    isSwitchingChain,
    requiredChainId,
    switchChain,
    getSwitchToRequiredNetworkRequest,
  }
}
