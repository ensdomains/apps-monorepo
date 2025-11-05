import type { CoinType } from '@ens-apps/abis/chains'
import { getChainIdForCoinType } from '@ens-apps/abis/chains'
import { useAccount, useSwitchChain } from 'wagmi'

export type UseNetworkSwitchingParams = {
  coinType: CoinType
  isTestnet: boolean
}

export function useNetworkSwitching({
  coinType,
  isTestnet,
}: UseNetworkSwitchingParams) {
  const { chain } = useAccount()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()

  const requiredChainId = getChainIdForCoinType(coinType, isTestnet)
  const isWrongNetwork = chain?.id !== requiredChainId

  const switchToRequiredNetwork = () => {
    if (isWrongNetwork) {
      switchChain({ chainId: requiredChainId })
    }
  }

  return {
    isWrongNetwork,
    isSwitchingChain,
    requiredChainId,
    switchToRequiredNetwork,
  }
}
