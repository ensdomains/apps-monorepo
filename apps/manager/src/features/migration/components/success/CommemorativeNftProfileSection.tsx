import { Trans } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import { buildCommemorativeNftCardData } from '../../commemorative-nft/cardData'
import { isCommemorativeNftCanonicalProfile } from '../../commemorative-nft/sharing'
import { useCommemorativeNftOffer } from '../../commemorative-nft/useCommemorativeNftOffer'
import { useVerifiedCommemorativeNftOwner } from '../../commemorative-nft/useVerifiedCommemorativeNftOwner'
import { MigrationPrimaryButton } from '../MigrationPrimaryButton'
import { CommemorativeNftCard } from './CommemorativeNftCard'
import { CommemorativeNftClaimDialog } from './CommemorativeNftClaimDialog'
import type { CommemorativeNftCardData } from './MigrationSuccessDialog.types'

type CommemorativeNftProfileSectionProps = {
  readonly isOwner: boolean
  readonly name: string
}

type ProfileOfferStatus = 'minted' | 'ready' | 'pending-claim' | 'reconciling'

const ProfileOffer = ({
  card,
  status,
  active,
  canOpen,
  onOpen,
}: {
  readonly card: CommemorativeNftCardData | undefined
  readonly status: ProfileOfferStatus
  readonly active: boolean
  readonly canOpen: boolean
  readonly onOpen: () => void
}) => (
  <section className="border-[0.25px] border-transparent bg-transparent px-5 py-6 lg:landscape:px-8 lg:landscape:pt-8 lg:landscape:pb-6">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-sans text-base text-ens-quartz-900 leading-normal">
        <Trans>ENSv2 commemorative NFT</Trans>
      </h2>
      <span className="rounded-full bg-ens-pink/10 px-2.5 py-1 font-semi-mono text-[10px] text-ens-garnet-500 uppercase tracking-[0.12em]">
        {status === 'minted' ? (
          <Trans>Minted</Trans>
        ) : status === 'ready' ? (
          <Trans>Ready</Trans>
        ) : (
          <Trans>Checking</Trans>
        )}
      </span>
    </div>

    {card ? (
      <div className="mt-4 overflow-hidden rounded-xl border border-ens-pink/15 bg-[linear-gradient(180deg,#fff5f8,#ffe6f0)] px-2 py-5">
        <CommemorativeNftCard
          active={active}
          state={{ status: 'minted', card: card }}
        />
      </div>
    ) : (
      <div className="relative mt-4 overflow-hidden rounded-xl border border-ens-pink/20 bg-[linear-gradient(110deg,#fff5f8,#ffe0ec)] p-5">
        <div className="absolute -top-10 -right-8 size-28 rounded-full bg-white/50 blur-2xl" />
        <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/75 text-ens-garnet-500">
              <MSymbol className="text-[22px]" symbol="auto_awesome" />
            </div>
            <p className="max-w-md font-sans text-ens-garnet-700 text-sm leading-relaxed">
              {status === 'pending-claim' ? (
                <Trans>
                  Your mint was submitted. Check its status to continue.
                </Trans>
              ) : status === 'reconciling' ? (
                <Trans>
                  Your upgrades still need to be verified. Check again to
                  continue.
                </Trans>
              ) : (
                <Trans>
                  Your card is ready to preview. Minting is optional and you pay
                  the network gas.
                </Trans>
              )}
            </p>
          </div>
          <MigrationPrimaryButton
            className="shrink-0"
            disabled={!canOpen}
            onClick={onOpen}
            type="button"
          >
            {status === 'ready' ? (
              <Trans>Preview and mint</Trans>
            ) : (
              <Trans>Check status</Trans>
            )}
            <MSymbol className="text-[18px]" symbol="arrow_forward" />
          </MigrationPrimaryButton>
        </div>
      </div>
    )}
  </section>
)

export const CommemorativeNftProfileSection = ({
  isOwner,
  name,
}: CommemorativeNftProfileSectionProps) => {
  const navigate = useNavigate()
  const verifiedOwner = useVerifiedCommemorativeNftOwner()
  const dialogScope = `${verifiedOwner}:${name}`
  const [openScope, setOpenScope] = useState<string>()
  const open = isOwner && !!verifiedOwner && openScope === dialogScope
  const setOpen = (value: boolean) =>
    setOpenScope(value ? dialogScope : undefined)
  const offer = useCommemorativeNftOffer({
    ownerAddress: verifiedOwner,
    enabled: isOwner,
  })
  const {
    availability,
    migrationCompletion,
    minted,
    visibleEligibility: eligibility,
  } = offer
  const isCanonical = eligibility
    ? isCommemorativeNftCanonicalProfile(name, eligibility.profileName)
    : false
  const offerStatus: ProfileOfferStatus = minted
    ? 'minted'
    : offer.canRecoverClaim
      ? 'pending-claim'
      : offer.canReconcileMigration
        ? 'reconciling'
        : 'ready'
  const cardData = useMemo(
    () =>
      eligibility && minted
        ? buildCommemorativeNftCardData({
            chainId: availability.chainId,
            eligibility,
            minted: true,
            ownerAddress: eligibility.ownerAddress,
          })
        : undefined,
    [availability.chainId, eligibility, minted],
  )

  return (
    <>
      {isOwner && offer.canRecoverClaim && (!eligibility || !isCanonical) ? (
        <div className="flex justify-center px-5 py-6">
          <MigrationPrimaryButton onClick={() => setOpen(true)}>
            <Trans>Check mint status</Trans>
          </MigrationPrimaryButton>
        </div>
      ) : null}
      {isOwner &&
      eligibility &&
      isCanonical &&
      (minted ||
        offer.canRecoverClaim ||
        offer.canReconcileMigration ||
        migrationCompletion.isComplete) ? (
        <ProfileOffer
          active={!open}
          canOpen={offer.canOpenMint}
          card={cardData}
          onOpen={() => setOpen(true)}
          status={offerStatus}
        />
      ) : null}

      <CommemorativeNftClaimDialog
        context="mint-later"
        onClose={() => setOpen(false)}
        onOpenDashboard={() => {
          setOpen(false)
          navigate({ to: '/dashboard' })
        }}
        open={open}
        ownerAddress={verifiedOwner}
      />
    </>
  )
}
