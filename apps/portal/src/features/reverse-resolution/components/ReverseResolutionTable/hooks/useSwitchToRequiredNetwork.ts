import {
  getChainIdForReverseRegistrarChainId,
  type NetworkKey,
  type ReverseRegistrarChainId,
} from '@ens-apps/l2-primary/v1'
import { useAccount, useSwitchChain } from 'wagmi'

type UseNetworkSwitchingParams = {
  reverseRegistrarChainId: ReverseRegistrarChainId
  /** Target deployment; defaults to 'sepolia' */
  network?: NetworkKey // 'mainnet' | 'sepolia'
}

export function useSwitchToRequiredNetwork({
  reverseRegistrarChainId,
  network = 'sepolia',
}: UseNetworkSwitchingParams) {
  const { chain } = useAccount()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()

  const requiredChainId = getChainIdForReverseRegistrarChainId(
    reverseRegistrarChainId,
    network,
  )
  const isWrongChain = chain?.id !== requiredChainId

  const getSwitchToRequiredNetworkRequest = () => ({
    chainId: requiredChainId,
  })

  return {
    isWrongChain,
    isSwitchingChain,
    requiredChainId,
    switchChain,
    getSwitchToRequiredNetworkRequest,
  }
}
