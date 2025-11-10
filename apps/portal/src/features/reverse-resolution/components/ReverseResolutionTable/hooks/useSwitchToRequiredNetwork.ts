import type { ReverseRegistrarCoinId } from '@ens-apps/l2-primary/reverseRegistrarCoinIds'
import {
  getChainIdForReverseRegistrarCoinId,
  type NetworkKey,
} from '@ens-apps/l2-primary/reverseRegistrarCoinIds'
import { useAccount, useSwitchChain } from 'wagmi'

export type UseNetworkSwitchingParams = {
  reverseRegistrarCoinId: ReverseRegistrarCoinId
  /** Target deployment; defaults to 'sepolia' */
  network?: NetworkKey // 'mainnet' | 'sepolia'
}

export function useSwitchToRequiredNetwork({
  reverseRegistrarCoinId,
  network = 'sepolia',
}: UseNetworkSwitchingParams) {
  const { chain } = useAccount()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()

  const requiredChainId = getChainIdForReverseRegistrarCoinId(
    reverseRegistrarCoinId,
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
