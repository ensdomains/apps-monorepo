import { SettingsMenu } from '@/components/SettingsMenu'
import { Button } from '@/components/ui/button'
import { useConnectModal } from '@/features/wallet/ConnectModalProvider'

export const ConnectWalletMessage = () => {
  const { openConnectModal } = useConnectModal()

  return (
    <div className="flex flex-col gap-3 rounded-md bg-neutral-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-p text-foreground">
        Connect wallet to manage names, register, and renew
      </p>
      <div className="flex items-center justify-between gap-3">
        <SettingsMenu
          side="bottom"
          className="size-7.5 rounded-xs bg-neutral-3 text-neutral-7 hover:bg-neutral-4 [&_svg]:size-5"
        />
        <Button
          size="sm"
          className="h-7 rounded-xs bg-neutral-9 px-1.5 text-sm text-neutral-0 hover:bg-neutral-8"
          onClick={() => openConnectModal?.()}
        >
          Connect wallet
        </Button>
      </div>
    </div>
  )
}
