import type { ReverseRegistrarCoinId } from '@ens-apps/l2-primary/reverseRegistrarCoinIds'
import { getChainIdForReverseRegistrarCoinId } from '@ens-apps/l2-primary/reverseRegistrarCoinIds'
import { useAccount, useSwitchChain } from 'wagmi'

export type UseNetworkSwitchingParams = {
  reverseRegistrarCoinId: ReverseRegistrarCoinId
  isTestnet: boolean
}

export function useSwitchToRequiredNetwork({
  reverseRegistrarCoinId,
  isTestnet,
}: UseNetworkSwitchingParams) {
  const { chain } = useAccount()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()

  const requiredChainId = getChainIdForReverseRegistrarCoinId(
    reverseRegistrarCoinId,
    isTestnet,
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
