import { Trans } from '@lingui/react/macro'
import { WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { WalletConnectDialog } from '@/features/wallet/components/WalletConnectDialog'
import { useSmartAccountContext } from '@/lib/smart-account'
import { tw } from '@/utils/tailwind'

export const DisconnectedHeaderContent = () => {
  const [open, setOpen] = useState(false)
  const { isLoading } = useSmartAccountContext()

  return (
    <>
      <div className="ml-auto flex h-full items-center gap-4">
        <Button
          // TODO: Button needs better styling options so we have to use custom styles for now
          className="h-full w-30 md:w-40"
          disabled={isLoading}
          onClick={() => setOpen(true)}
          variant="ghost"
        >
          {isLoading ? <Trans>Loading...</Trans> : <Trans>Connect</Trans>}
          <WalletIcon className={tw('size-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      <WalletConnectDialog onOpenChange={setOpen} open={open} />
    </>
  )
}
