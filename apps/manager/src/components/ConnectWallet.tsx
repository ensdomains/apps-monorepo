import { useConnectModal } from '@/lib/wallet'

export const ConnectWallet = () => {
  const { openConnectModal } = useConnectModal()
  return (
    <button onClick={() => openConnectModal?.()} type="button">
      Connect Wallet
    </button>
  )
}
