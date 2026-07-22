import { Trans } from '@lingui/react/macro'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { MSymbol } from '@/components/ui/material-symbol'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import {
  arrowRightUrl,
  CommemorativeNftCard,
} from './success/CommemorativeNftCard'
import type { MigrationSuccessDialogState } from './success/MigrationSuccessDialog.types'

type MigrationSuccessDialogProps = {
  readonly open: boolean
  readonly state: MigrationSuccessDialogState
  readonly onClose: () => void
  readonly onViewProfile: () => void
}

export const MigrationSuccessDialog = ({
  open,
  state,
  onClose,
  onViewProfile,
}: MigrationSuccessDialogProps) => (
  <Dialog
    onOpenChange={(value) => {
      if (!value) onClose()
    }}
    open={open}
  >
    <DialogContent
      className="h-[min(620px,calc(100dvh-1rem))] w-[min(408px,calc(100vw-1rem))] max-w-none gap-0 overflow-y-auto overflow-x-hidden rounded-sm border-0 bg-[linear-gradient(180.8deg,#feeaf0_0.45%,#ffc6e0_173.91%)] p-0 shadow-none sm:max-w-none"
      showCloseButton={false}
    >
      <GrainOverlay className="opacity-40" />
      <button
        className="absolute top-6 right-6 z-20 flex size-6 items-center justify-center rounded-xs text-ens-garnet-900 transition-opacity hover:opacity-65 focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2"
        onClick={onClose}
        type="button"
      >
        <MSymbol className="text-[20px]" symbol="close" />
        <span className="sr-only">
          <Trans>Close</Trans>
        </span>
      </button>

      <div className="relative z-10 flex flex-col items-center gap-5 px-4 py-8 min-[360px]:px-7">
        <div className="flex w-full shrink-0 flex-col items-center gap-5">
          <div className="flex w-full shrink-0 flex-col items-start gap-4 pt-4 pb-[0.75px]">
            <DialogTitle className="flex h-[71px] w-full flex-col justify-center font-normal text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
              <Trans>Your name(s) have been upgraded!</Trans>
            </DialogTitle>
            <DialogDescription className="w-full font-normal text-[14px] text-ens-garnet-500 leading-[1.2] tracking-[0.14px]">
              <Trans>
                You&apos;re among the first on ENSv2. This NFT marks the moment.
              </Trans>
            </DialogDescription>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-5">
            <CommemorativeNftCard state={state} />

            <button
              className="group flex items-center gap-1 whitespace-nowrap font-semi-mono text-[12px] text-ens-garnet-500 uppercase leading-[1.2] tracking-[0.12px] transition-opacity hover:opacity-70 active:opacity-50"
              onClick={onViewProfile}
              type="button"
            >
              <span>
                <Trans>Your new profile is ready.</Trans>{' '}
                <span className="font-medium">
                  <Trans>Go make it yours</Trans>
                </span>
              </span>
              <img
                alt=""
                className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5"
                src={arrowRightUrl}
              />
            </button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
)
