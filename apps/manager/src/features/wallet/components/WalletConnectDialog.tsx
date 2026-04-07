import { useModal } from '@getpara/react-sdk-lite'
import { Trans } from '@lingui/react/macro'
import { Loader2Icon, WalletIcon } from 'lucide-react'
import metamaskIcon from '@/assets/icons/metamask-color.svg'
import paraIcon from '@/assets/icons/para-color.svg'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDirectMetaMask } from '@/lib/DirectMetaMaskContext'

interface WalletConnectDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export const WalletConnectDialog = ({
  open,
  onOpenChange,
}: WalletConnectDialogProps) => {
  const { openModal } = useModal()
  const directMetaMask = useDirectMetaMask()

  const handleParaConnect = async () => {
    await openModal()
    onOpenChange(false)
  }

  const handleMetaMaskConnect = async () => {
    await directMetaMask.connect()
    onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Connect your wallet</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Choose the connection path you want to test in the manager.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <button
            className="flex w-full items-center gap-4 rounded-xl border border-border bg-background px-4 py-4 text-left transition-colors hover:bg-muted/40"
            onClick={() => void handleParaConnect()}
            type="button"
          >
            <img
              alt="Para"
              className="size-12 rounded-lg bg-[#FEF9F8] p-2"
              src={paraIcon}
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-base">
                <Trans>Para</Trans>
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                <Trans>
                  Use the existing Para modal for embedded wallets or
                  Para-managed external connections.
                </Trans>
              </p>
            </div>
          </button>

          <button
            className="flex w-full items-center gap-4 rounded-xl border border-border bg-background px-4 py-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={directMetaMask.isConnecting}
            onClick={() => void handleMetaMaskConnect()}
            type="button"
          >
            <img
              alt="MetaMask"
              className="size-12 rounded-lg bg-[#FFF5EE] p-2"
              src={metamaskIcon}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium text-base">
                <Trans>MetaMask</Trans>
                {directMetaMask.isConnecting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                <Trans>
                  Connect directly through wagmi like the standalone MetaMask
                  debug app.
                </Trans>
              </p>
            </div>
            <WalletIcon className="size-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)} size="sm" variant="ghost">
            <Trans>Close</Trans>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
