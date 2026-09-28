import { SettingsMenu } from '@/components/SettingsMenu'
import { Button } from '@/components/ui/button'
import { useConnectModal } from '@/features/wallet/ConnectModalProvider'

export const ConnectWalletMessage = () => {
  const { openConnectModal } = useConnectModal()

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-neutral-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-p text-foreground">
        Connect wallet to manage names, register, and renew
      </p>
      <div className="flex items-center justify-between gap-3">
        <SettingsMenu side="bottom" />
        <Button size="sm" onClick={() => openConnectModal?.()}>
          Connect wallet
        </Button>
      </div>
    </div>
  )
}
