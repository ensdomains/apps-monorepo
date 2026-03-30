import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

type SuccessModalProps = {
  readonly open: boolean
  readonly onClose: () => void
}

type ModalState = 'reveal-nft' | 'revealed'

export const SuccessModal = ({ open, onClose }: SuccessModalProps) => {
  const [state, setState] = useState<ModalState>('reveal-nft')

  const handleClose = () => {
    setState('reveal-nft')
    onClose()
  }

  return (
    <Dialog
      onOpenChange={(value) => {
        if (!value) handleClose()
      }}
      open={open}
    >
      <DialogContent
        className="overflow-hidden border-0 bg-linear-to-b from-[#feeaf0] to-[#ffc6e0] sm:max-w-[420px]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">
          <Trans>Migration Complete</Trans>
        </DialogTitle>
        <DialogDescription className="sr-only">
          <Trans>Your names have been upgraded</Trans>
        </DialogDescription>

        {state === 'reveal-nft' && (
          <div className="flex flex-col items-center gap-6 py-8">
            <p className="text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
              <Trans>Migration Complete!</Trans>
            </p>
            <p className="text-[#e72a96] text-sm">
              <Trans>
                Your names have been upgraded. Reveal your commemorative NFT.
              </Trans>
            </p>
            <p className="font-semi-mono text-[#e72a96] text-xs uppercase tracking-[0.12px]">
              WIP — Reveal NFT
            </p>
            <button
              className="w-full rounded-sm bg-ens-garnet-900 px-4 py-3 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
              onClick={() => setState('revealed')}
              type="button"
            >
              <Trans>Reveal NFT</Trans>
            </button>
          </div>
        )}

        {state === 'revealed' && (
          <div className="flex flex-col items-center gap-6 py-8">
            <p className="text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
              <Trans>Your NFT is here!</Trans>
            </p>
            <p className="text-[#e72a96] text-sm">
              <Trans>Share your commemorative NFT with the world.</Trans>
            </p>
            <p className="font-semi-mono text-[#e72a96] text-xs uppercase tracking-[0.12px]">
              WIP — NFT Display + Share
            </p>
            <button
              className="w-full rounded-sm bg-ens-garnet-900 px-4 py-3 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
              onClick={handleClose}
              type="button"
            >
              <Trans>Done</Trans>
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
