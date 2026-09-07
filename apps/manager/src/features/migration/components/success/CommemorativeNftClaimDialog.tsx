import { Plural, Trans } from '@lingui/react/macro'
import { useEffect, useRef } from 'react'
import type { Address } from 'viem'
import { useChainId, useConnection } from 'wagmi'
import { cn } from '@/lib/utils'
import {
  type CommemorativeNftAdmission,
  getCommemorativeNftSessionKey,
} from '../../commemorative-nft/flowState'
import { useCommemorativeNftFlow } from '../../commemorative-nft/useCommemorativeNftFlow'
import { MigrationSuccessDialog } from '../MigrationSuccessDialog'

type CommemorativeNftClaimDialogProps = {
  readonly context: 'migration' | 'mint-later'
  readonly migratedNameCount?: number
  readonly onClose: () => void
  readonly onViewProfile: (profileName: string | undefined) => void
  readonly open: boolean
  readonly ownerAddress: Address | undefined
  readonly preview?: boolean
  readonly previewProfileName?: string
}

const ClaimAdmissionStatus = ({
  admission,
  context,
  migratedNameCount,
  onClose,
  onRetry,
}: {
  readonly admission: Extract<
    CommemorativeNftAdmission,
    { status: 'checking' | 'unavailable' }
  >
  readonly context: CommemorativeNftClaimDialogProps['context']
  readonly migratedNameCount: number
  readonly onClose: () => void
  readonly onRetry: () => void
}) => {
  const canRetry =
    admission.status === 'unavailable' && admission.reason !== 'ownerMissing'

  return (
    <section
      className={cn(
        'fade-in relative z-10 flex animate-in flex-col items-center justify-center gap-5 px-6 py-8 text-center duration-150 motion-reduce:animate-none',
        context === 'migration' ? 'flex-1' : 'mx-4 md:mx-0',
      )}
    >
      <h2 className="font-sans text-2xl text-ens-garnet-900 leading-tight">
        {context === 'migration' ? (
          <Plural
            one="Your name has been upgraded!"
            other="Your names have been upgraded!"
            value={migratedNameCount}
          />
        ) : (
          <Trans>Your commemorative NFT</Trans>
        )}
      </h2>
      <p
        aria-live="polite"
        className="max-w-sm font-sans text-ens-garnet-500 text-sm leading-relaxed"
      >
        {admission.status === 'checking' ? (
          <Trans>Checking your NFT status…</Trans>
        ) : admission.reason === 'ownerMissing' ? (
          <Trans>Reconnect your owner wallet to mint this NFT.</Trans>
        ) : admission.reason === 'offline' ? (
          <Trans>Reconnect to the internet to check your NFT status.</Trans>
        ) : (
          <Trans>Your NFT status could not be checked. Please try again.</Trans>
        )}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {canRetry ? (
          <button
            className="min-h-11 rounded-xs bg-ens-garnet-900 px-5 py-3 font-semi-mono text-ens-garnet-50 text-xs uppercase tracking-[0.1em] transition-colors hover:bg-ens-garnet-800 focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2 motion-reduce:transition-none"
            onClick={onRetry}
            type="button"
          >
            <Trans>Try again</Trans>
          </button>
        ) : null}
        <button
          className={cn(
            'min-h-11 rounded-xs px-5 py-3 font-semi-mono text-xs uppercase tracking-[0.1em] transition-colors focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2 motion-reduce:transition-none',
            canRetry
              ? 'text-ens-garnet-700 hover:bg-ens-garnet-900/5'
              : 'bg-ens-garnet-900 text-ens-garnet-50 hover:bg-ens-garnet-800',
          )}
          onClick={onClose}
          type="button"
        >
          {context === 'migration' ? (
            <Trans>Continue to dashboard</Trans>
          ) : (
            <Trans>Close</Trans>
          )}
        </button>
      </div>
    </section>
  )
}

const OpenCommemorativeNftClaimDialog = ({
  context,
  migratedNameCount = 0,
  onClose,
  onViewProfile,
  ownerAddress,
  preview,
  previewProfileName,
  walletAddress,
}: CommemorativeNftClaimDialogProps & {
  readonly walletAddress: Address | undefined
}) => {
  const flow = useCommemorativeNftFlow({
    open: true,
    ownerAddress,
    walletAddress,
    migratedNameCount,
    preview,
    previewProfileName,
  })
  const shouldSkip =
    flow.admission.status === 'alreadyMinted' ||
    (context === 'migration' &&
      flow.admission.status === 'unavailable' &&
      flow.admission.reason === 'ownerMissing')
  const didSkip = useRef(false)

  useEffect(() => {
    if (!shouldSkip || didSkip.current) return
    didSkip.current = true
    onClose()
  }, [onClose, shouldSkip])

  if (shouldSkip) return null
  if (
    flow.admission.status === 'checking' ||
    flow.admission.status === 'unavailable'
  ) {
    return (
      <ClaimAdmissionStatus
        admission={flow.admission}
        context={context}
        migratedNameCount={migratedNameCount}
        onClose={onClose}
        onRetry={flow.retry}
      />
    )
  }

  return (
    <MigrationSuccessDialog
      canMint={flow.canMint}
      context={context}
      migratedNameCount={migratedNameCount}
      onClose={onClose}
      onMint={flow.mint}
      onRetry={flow.retry}
      onRevealComplete={flow.completeReveal}
      onViewProfile={() => onViewProfile(flow.eligibility?.profileName)}
      open
      state={flow.state}
    />
  )
}

export const CommemorativeNftClaimDialog = (
  props: CommemorativeNftClaimDialogProps,
) => {
  const chainId = useChainId()
  const { address: walletAddress } = useConnection()
  if (!props.open) return null
  return (
    <OpenCommemorativeNftClaimDialog
      {...props}
      key={getCommemorativeNftSessionKey({ ...props, chainId, walletAddress })}
      walletAddress={walletAddress}
    />
  )
}
