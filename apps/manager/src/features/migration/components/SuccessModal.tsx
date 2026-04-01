import { Trans } from '@lingui/react/macro'
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

export const SuccessModal = ({ open, onClose }: SuccessModalProps) => {
  return (
    <Dialog
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
      open={open}
    >
      <DialogContent
        className="overflow-hidden border-0 bg-linear-to-b from-[#feeaf0] to-[#ffc6e0] sm:max-w-[420px]"
        showCloseButton={false}
      >
        <div className="flex flex-col items-center gap-6 py-8">
          <DialogTitle className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
            <Trans>Migration Complete!</Trans>
          </DialogTitle>
          <DialogDescription className="text-center text-[#e72a96] text-sm">
            <Trans>Your names have been successfully upgraded.</Trans>
          </DialogDescription>
          <button
            className="w-full rounded-sm bg-ens-garnet-900 px-4 py-3 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
            onClick={onClose}
            type="button"
          >
            <Trans>Done</Trans>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
