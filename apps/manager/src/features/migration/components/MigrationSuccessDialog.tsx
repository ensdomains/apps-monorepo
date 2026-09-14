import { Plural, Trans } from '@lingui/react/macro'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { MSymbol } from '@/components/ui/material-symbol'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { cn } from '@/lib/utils'
import { MigrationPrimaryButton } from './MigrationPrimaryButton'
import {
  shouldHideCommemorativeNftDialog,
  shouldShowPlainMigrationSuccess,
} from './MigrationSuccessDialog.helpers'
import { CommemorativeNftCard } from './success/CommemorativeNftCard'
import type { MigrationSuccessDialogState } from './success/MigrationSuccessDialog.types'

type MigrationSuccessDialogProps = {
  readonly context: 'migration' | 'mint-later'
  readonly open: boolean
  readonly state: MigrationSuccessDialogState
  readonly migratedNameCount: number
  readonly canMint: boolean
  readonly onClose: () => void
  readonly onMint: () => void
  readonly onRetry: () => void
  readonly onViewProfile: () => void
}

const DialogHeading = ({
  context,
  state,
}: {
  readonly context: MigrationSuccessDialogProps['context']
  readonly state: MigrationSuccessDialogState
}) => (
  <div className="flex w-full max-w-[486px] shrink-0 flex-col items-center gap-2 text-center md:gap-4">
    <DialogTitle className="w-full text-balance font-normal font-serif text-[20px] text-ens-garnet-900 leading-[1.1] tracking-[-0.02em] md:text-[32px]">
      {context === 'migration' ? (
        <Trans>Your name(s) have been upgraded!</Trans>
      ) : (
        <Trans>Your ENSv2 moment is waiting</Trans>
      )}
    </DialogTitle>
    <DialogDescription className="max-w-[400px] font-normal font-sans text-ens-garnet-500 text-sm leading-[1.2] tracking-[0.01em]">
      {state.status === 'loadingEligibility' ? (
        <Trans>
          Here&apos;s a gift to celebrate your migration to the next era of ENS
        </Trans>
      ) : (
        <Trans>
          Congratulations, you&apos;re among the first on ENSv2. This
          personalized NFT marks the moment.
        </Trans>
      )}
    </DialogDescription>
  </div>
)

const PlainMigrationSuccessContent = ({
  migratedNameCount,
  onOpenDashboard,
}: {
  readonly migratedNameCount: number
  readonly onOpenDashboard: () => void
}) => (
  <div className="flex w-full flex-col items-center text-center">
    <DialogTitle className="max-w-sm text-balance font-normal text-[30px] text-ens-garnet-900 leading-[1.05] tracking-[-0.03em] sm:text-[34px]">
      <Plural
        one="Your name has been upgraded!"
        other="Your names have been upgraded!"
        value={migratedNameCount}
      />
    </DialogTitle>
    <DialogDescription className="mt-3 max-w-80 text-pretty font-normal text-[15px] text-ens-garnet-800/75 leading-[1.45]">
      <Trans>You can manage your upgraded names from the dashboard.</Trans>
    </DialogDescription>

    <div className="mt-8 flex w-full justify-center">
      <MigrationPrimaryButton onClick={onOpenDashboard}>
        <span className="flex items-center gap-2">
          <Trans>Open Dashboard</Trans>
          <MSymbol
            aria-hidden
            className="text-[20px] transition-transform duration-150 ease-out group-hover/button:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
            symbol="arrow_forward"
          />
        </span>
      </MigrationPrimaryButton>
    </div>
  </div>
)

const SecondaryButton = ({
  children,
  onClick,
}: {
  readonly children: React.ReactNode
  readonly onClick: () => void
}) => (
  <button
    className="min-h-11 rounded-xl px-4 py-3 font-medium font-sans text-ens-garnet-900 text-sm uppercase tracking-[0.1em] transition-opacity hover:opacity-65 focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2 motion-reduce:transition-none"
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
  onViewProfile,
}: Omit<
  MigrationSuccessDialogProps,
  'context' | 'migratedNameCount' | 'open'
>) => {
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
          <MigrationPrimaryButton onClick={onRetry}>
            <Trans>Try again</Trans>
          </MigrationPrimaryButton>
        ) : (
          <MigrationPrimaryButton onClick={onViewProfile}>
            <Trans>Continue to profile</Trans>
          </MigrationPrimaryButton>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-[486px] flex-col items-center gap-4 md:gap-6">
      <CommemorativeNftCard state={state} variant="dialog" />

      <div className="flex w-full flex-col items-center gap-1">
        {state.status === 'loadingEligibility' ? (
          <>
            <MigrationPrimaryButton disabled onClick={onMint}>
              <Trans>Mint</Trans>
              <MSymbol
                aria-hidden
                className="text-lg leading-none"
                symbol="spa"
              />
            </MigrationPrimaryButton>
            <SecondaryButton onClick={onClose}>
              <Trans>Later</Trans>
            </SecondaryButton>
          </>
        ) : null}

        {state.status === 'readyToMint' ? (
          <>
            <MigrationPrimaryButton disabled={!canMint} onClick={onMint}>
              <Trans>Mint</Trans>
              <MSymbol
                aria-hidden
                className="text-lg leading-none"
                symbol="spa"
              />
            </MigrationPrimaryButton>
            <SecondaryButton onClick={onClose}>
              <Trans>Later</Trans>
            </SecondaryButton>
          </>
        ) : null}

        {state.status === 'minting' ? (
          <>
            <MigrationPrimaryButton disabled onClick={onMint}>
              <span className="flex items-center gap-2">
                <span className="size-3 animate-spin rounded-full border border-current border-t-transparent motion-reduce:animate-none" />
                <Trans>Minting…</Trans>
              </span>
            </MigrationPrimaryButton>
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
              className="pb-2 text-center font-sans text-ens-garnet-500 text-sm leading-[1.2] tracking-[0.01em]"
            >
              <Trans>Your new profile is ready.</Trans>
            </p>
            <MigrationPrimaryButton onClick={onViewProfile}>
              <span className="flex items-center gap-2">
                <Trans>Go make it yours</Trans>
                <MSymbol
                  aria-hidden
                  className="text-lg leading-none"
                  symbol="face_retouching_natural"
                />
              </span>
            </MigrationPrimaryButton>
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
            <MigrationPrimaryButton onClick={onRetry}>
              <Trans>Try again</Trans>
            </MigrationPrimaryButton>
            <SecondaryButton onClick={onClose}>
              <Trans>Later</Trans>
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
  migratedNameCount,
  canMint,
  onClose,
  onMint,
  onRetry,
  onViewProfile,
}: MigrationSuccessDialogProps) => {
  if (shouldHideCommemorativeNftDialog({ context, state })) return null
  const showPlainMigrationSuccess = shouldShowPlainMigrationSuccess({
    context,
    state,
  })

  return (
    <Dialog
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
      open={open}
    >
      <DialogContent
        className="h-auto max-h-[calc(100dvh-2rem)] w-[min(353px,calc(100vw-2rem))] max-w-none gap-0 overflow-y-auto overflow-x-hidden rounded-lg border-0 bg-[linear-gradient(181deg,var(--color-ens-garnet-100)_0.45%,var(--color-ens-garnet-200)_173.91%)] p-0 shadow-[0_24px_90px_rgba(70,0,30,0.24)] motion-reduce:animate-none sm:max-w-none md:w-[min(726px,calc(100vw-3rem))]"
        onFocusCapture={(event) => {
          // Radix loops focus with preventScroll; keep off-screen actions visible.
          if (event.target !== event.currentTarget) {
            event.target.scrollIntoView({ block: 'nearest' })
          }
        }}
        overlayClassName="bg-ens-garnet-900/50"
        showCloseButton={false}
      >
        <GrainOverlay className="opacity-40" />
        <button
          className="absolute top-1 right-1 z-20 flex size-11 items-center justify-center rounded-full text-ens-garnet-800 transition-colors duration-150 ease-out hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-[-4px] motion-reduce:transition-none"
          onClick={onClose}
          type="button"
        >
          <MSymbol aria-hidden className="text-xl" symbol="close" />
          <span className="sr-only">
            <Trans>Close</Trans>
          </span>
        </button>

        <div
          className={cn(
            'relative z-10 flex w-full flex-col items-center px-5',
            showPlainMigrationSuccess
              ? 'pt-16 pb-9 sm:pb-10'
              : 'gap-5 pt-13 pb-8 md:gap-6 md:py-13',
          )}
        >
          {showPlainMigrationSuccess ? (
            <PlainMigrationSuccessContent
              migratedNameCount={migratedNameCount}
              onOpenDashboard={onClose}
            />
          ) : (
            <>
              <DialogHeading context={context} state={state} />
              <StatusContent
                canMint={canMint}
                onClose={onClose}
                onMint={onMint}
                onRetry={onRetry}
                onViewProfile={onViewProfile}
                state={state}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
