import { useModal, useWallet } from '@getpara/react-sdk-lite'
import { WalletIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { tw } from '@/utils/tailwind'

export const DisconnectedHeaderContent = () => {
  const { openModal } = useModal()
  const { isLoading: walletLoading } = useWallet()

  const handleConnect = async () => {
    try {
      await openModal()
    } catch (error) {
      console.error('Failed to open Para modal:', error)
    }
  }

  return (
    <div className="ml-auto flex h-full items-center gap-4">
      <Button
        // TODO: Button needs better styling options so we have to use custom styles for now
        className="h-full w-30 md:w-40"
        disabled={walletLoading}
        onClick={handleConnect}
        variant="ghost"
      >
        {walletLoading ? 'Loading...' : 'Connect'}
        <WalletIcon className={tw('size-4', walletLoading && 'animate-spin')} />
      </Button>
    </div>
  )
}
