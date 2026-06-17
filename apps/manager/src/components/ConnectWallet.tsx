import { useConnection } from 'wagmi'
import { useConnectModal } from '@/lib/wallet'

// Disconnected-only connect trigger. The connected-state UI (address, balance,
// chain) is owned by the Header/account components, not here — `openConnectModal`
// is undefined once connected, so this renders nothing in that state.
export const ConnectWallet = () => {
  const { openConnectModal } = useConnectModal()
  const { isConnected } = useConnection()
  if (isConnected) return null
  return (
    <button onClick={() => openConnectModal?.()} type="button">
      Connect Wallet
    </button>
  )
}
