import { Trans } from '@lingui/react/macro'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { EXPLORER_URL } from '@/constants'

export const getExplorerRegisterUrl = (label: string) =>
  EXPLORER_URL
    ? `${EXPLORER_URL}/register?${new URLSearchParams({ name: `${label}.eth` })}`
    : null

// A Safe can't sign the HCA session (ECDSA only), so registration goes through
// the Explorer, which sends the transactions to the Safe directly.
export const SafeWalletDialog = ({
  open,
  label,
  onDismiss,
  onUseDifferentWallet,
}: {
  readonly open: boolean
  readonly label: string
  readonly onDismiss: () => void
  readonly onUseDifferentWallet: () => void
}) => {
  const explorerRegisterUrl = getExplorerRegisterUrl(label)

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) onDismiss()
      }}
      open={open}
    >
      <DialogContent className="max-w-xl gap-6 border-ens-gray-two p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-amber-50">
            <ShieldAlert aria-hidden="true" className="size-7 text-amber-800" />
          </div>
          <DialogTitle className="font-semibold text-ens-blue-midnight text-xl leading-tight">
            <Trans>Register this name in the ENS Explorer</Trans>
          </DialogTitle>
          <DialogDescription className="text-left text-base text-ens-gray">
            <Trans>
              We saw you're using Safe. Registering here needs a signature from
              a single owner key, which a Safe cannot give. Instead, use the ENS
              Explorer app which sends the transactions straight to your Safe,
              where your signers approve them as usual.
            </Trans>
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-2">
          {explorerRegisterUrl && (
            <Button asChild className="h-11 w-full rounded" variant="blue">
              <a
                href={explorerRegisterUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <Trans>Open in ENS Explorer</Trans>
              </a>
            </Button>
          )}
          <Button
            className="h-11 w-full rounded"
            onClick={onUseDifferentWallet}
            type="button"
            variant="ghost"
          >
            <Trans>Use a different wallet</Trans>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
