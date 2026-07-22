import { Trans } from '@lingui/react/macro'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { MSymbol } from '@/components/ui/material-symbol'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { CommemorativeNftCard } from './success/CommemorativeNftCard'
import type { MigrationSuccessDialogState } from './success/MigrationSuccessDialog.types'

type MigrationSuccessDialogProps = {
  readonly context: 'migration' | 'mint-later'
  readonly open: boolean
  readonly state: MigrationSuccessDialogState
  readonly canMint: boolean
  readonly onClose: () => void
  readonly onMint: () => void
  readonly onRetry: () => void
  readonly onRevealComplete: () => void
  readonly onViewProfile: () => void
}

const DialogHeading = ({
  context,
}: {
  readonly context: MigrationSuccessDialogProps['context']
}) => (
  <div className="flex w-full shrink-0 flex-col items-start gap-3 pt-3 pr-8">
    <DialogTitle className="font-normal text-[34px] text-ens-garnet-900 leading-[1.04] tracking-[-0.68px]">
      {context === 'migration' ? (
        <Trans>Your name(s) have been upgraded!</Trans>
      ) : (
        <Trans>Your ENSv2 moment is waiting</Trans>
      )}
    </DialogTitle>
    <DialogDescription className="font-normal text-[15px] text-ens-garnet-500 leading-[1.3] tracking-[0.08px]">
      <Trans>
        You&apos;re among the first on ENSv2. This NFT marks the moment.
      </Trans>
    </DialogDescription>
  </div>
)

const PrimaryButton = ({
  children,
  disabled,
  onClick,
}: {
  readonly children: React.ReactNode
  readonly disabled?: boolean
  readonly onClick: () => void
}) => (
  <button
    className="flex min-h-12 w-full items-center justify-center rounded-xs bg-ens-garnet-900 px-5 py-3 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[0.1em] shadow-[inset_0_-3px_0_rgba(0,0,0,0.3)] transition hover:bg-ens-garnet-800 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
)

const SecondaryButton = ({
  children,
  onClick,
}: {
  readonly children: React.ReactNode
  readonly onClick: () => void
}) => (
  <button
    className="min-h-10 px-4 font-semi-mono text-ens-garnet-500 text-xs uppercase tracking-[0.1em] transition-opacity hover:opacity-65"
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
)

const StatusContent = ({
  state,
  canMint,
  onClose,
  onMint,
  onRetry,
  onRevealComplete,
  onViewProfile,
}: Omit<MigrationSuccessDialogProps, 'context' | 'open'>) => {
  if (state.status === 'ineligible') {
    return (
      <div className="flex min-h-86 w-full flex-col items-center justify-center gap-5 px-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-white/60 text-ens-garnet-500">
          <MSymbol className="text-[28px]" symbol="info" />
        </div>
        <div className="max-w-80 space-y-2">
          <p className="font-sans text-ens-garnet-900 text-xl">
            <Trans>This address is not in the commemorative snapshot.</Trans>
          </p>
          <p className="font-sans text-ens-garnet-500 text-sm leading-relaxed">
            <Trans>
              Eligibility was frozen on June 1 and is limited to one NFT per
              address.
            </Trans>
          </p>
        </div>
        <a
          className="font-semi-mono text-ens-garnet-500 text-xs uppercase tracking-[0.12em] underline underline-offset-4"
          href="/migration/nft"
        >
          <Trans>Learn about eligibility</Trans>
        </a>
        <PrimaryButton onClick={onViewProfile}>
          <Trans>Continue to profile</Trans>
        </PrimaryButton>
      </div>
    )
  }

  if (state.status === 'error' && !state.card) {
    return (
      <div className="flex min-h-86 w-full flex-col items-center justify-center gap-5 px-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-white/60 text-ens-garnet-500">
          <MSymbol className="text-[28px]" symbol="warning" />
        </div>
        <p className="max-w-80 font-sans text-ens-garnet-700 text-sm leading-relaxed">
          {state.message}
        </p>
        {state.stage === 'eligibility' ? (
          <PrimaryButton onClick={onRetry}>
            <Trans>Try again</Trans>
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={onViewProfile}>
            <Trans>Continue to profile</Trans>
          </PrimaryButton>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <CommemorativeNftCard onRevealComplete={onRevealComplete} state={state} />

      <div className="flex w-full flex-col items-center gap-1">
        {state.status === 'loadingEligibility' ||
        state.status === 'revealing' ? (
          <p
            aria-live="polite"
            className="py-3 font-semi-mono text-ens-garnet-500 text-xs uppercase tracking-[0.12em]"
          >
            <Trans>Preparing your commemorative NFT…</Trans>
          </p>
        ) : null}

        {state.status === 'readyToMint' ? (
          <>
            <PrimaryButton disabled={!canMint} onClick={onMint}>
              {canMint ? <Trans>Mint NFT</Trans> : <Trans>Preview only</Trans>}
            </PrimaryButton>
            <SecondaryButton onClick={onClose}>
              <Trans>Maybe later</Trans>
            </SecondaryButton>
          </>
        ) : null}

        {state.status === 'minting' ? (
          <>
            <PrimaryButton disabled onClick={onMint}>
              <span className="flex items-center gap-2">
                <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
                <Trans>Minting…</Trans>
              </span>
            </PrimaryButton>
            <p
              aria-live="polite"
              className="pt-2 font-sans text-ens-garnet-500 text-xs"
            >
              <Trans>
                Keep this window open while the transaction confirms.
              </Trans>
            </p>
          </>
        ) : null}

        {state.status === 'minted' ? (
          <>
            <p
              aria-live="polite"
              className="pb-2 font-sans text-ens-garnet-700 text-sm"
            >
              <Trans>Your commemorative NFT is now yours.</Trans>
            </p>
            <PrimaryButton onClick={onViewProfile}>
              <span className="flex items-center gap-2">
                <Trans>View profile</Trans>
                <MSymbol className="text-[20px]" symbol="arrow_forward" />
              </span>
            </PrimaryButton>
          </>
        ) : null}

        {state.status === 'error' && state.card ? (
          <>
            <p
              aria-live="polite"
              className="pb-2 text-center font-sans text-ens-garnet-700 text-sm"
            >
              {state.message}
            </p>
            <PrimaryButton onClick={onRetry}>
              <Trans>Try again</Trans>
            </PrimaryButton>
            <SecondaryButton onClick={onClose}>
              <Trans>Maybe later</Trans>
            </SecondaryButton>
          </>
        ) : null}
      </div>
    </div>
  )
}

export const MigrationSuccessDialog = ({
  context,
  open,
  state,
  canMint,
  onClose,
  onMint,
  onRetry,
  onRevealComplete,
  onViewProfile,
}: MigrationSuccessDialogProps) => (
  <Dialog
    onOpenChange={(value) => {
      if (!value) onClose()
    }}
    open={open}
  >
    <DialogContent
      className="h-auto max-h-[calc(100dvh-1rem)] w-[min(456px,calc(100vw-1rem))] max-w-none gap-0 overflow-y-auto overflow-x-hidden rounded-sm border-0 bg-[linear-gradient(180.8deg,#feeaf0_0.45%,#ffc6e0_173.91%)] p-0 shadow-[0_24px_90px_rgba(70,0,30,0.24)] sm:max-w-none"
      showCloseButton={false}
    >
      <GrainOverlay className="opacity-40" />
      <button
        className="absolute top-6 right-6 z-20 flex size-7 items-center justify-center rounded-full text-ens-garnet-900 transition hover:bg-white/40 focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2"
        onClick={onClose}
        type="button"
      >
        <MSymbol className="text-[21px]" symbol="close" />
        <span className="sr-only">
          <Trans>Close</Trans>
        </span>
      </button>

      <div className="relative z-10 flex w-full flex-col items-center gap-4 px-5 py-7 min-[420px]:px-8">
        <DialogHeading context={context} />
        <StatusContent
          canMint={canMint}
          onClose={onClose}
          onMint={onMint}
          onRetry={onRetry}
          onRevealComplete={onRevealComplete}
          onViewProfile={onViewProfile}
          state={state}
        />
      </div>
    </DialogContent>
  </Dialog>
)
