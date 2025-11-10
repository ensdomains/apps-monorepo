import type { ReverseRegistrarChainId } from '@ens-apps/l2-primary/reverseRegistrarChainIds'
import {
  getChainIdForReverseRegistrarChainId,
  type NetworkKey,
} from '@ens-apps/l2-primary/reverseRegistrarChainIds'
import { useAccount, useSwitchChain } from 'wagmi'

export type UseNetworkSwitchingParams = {
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
