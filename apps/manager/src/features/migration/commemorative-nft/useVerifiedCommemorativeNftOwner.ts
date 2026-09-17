import { useConnection } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account'
import { resolveVerifiedOwner } from '@/lib/smart-account/sessionGate'

export const useVerifiedCommemorativeNftOwner = () => {
  const { ownerAddress } = useSmartAccountContext()
  const { address, isConnected } = useConnection()
  return (
    resolveVerifiedOwner(ownerAddress, isConnected ? address : undefined) ??
    undefined
  )
}
