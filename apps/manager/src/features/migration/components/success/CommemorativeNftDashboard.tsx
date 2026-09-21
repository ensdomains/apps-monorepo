import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { Address } from 'viem'
import { buildCommemorativeNftCardData } from '../../commemorative-nft/cardData'
import { useCommemorativeNftOffer } from '../../commemorative-nft/useCommemorativeNftOffer'
import { useVerifiedCommemorativeNftOwner } from '../../commemorative-nft/useVerifiedCommemorativeNftOwner'
import { CommemorativeNftClaimDialog } from './CommemorativeNftClaimDialog'
import { CommemorativeNftDashboardSection } from './CommemorativeNftDashboardSection'
import { CommemorativeNftMintBanner } from './CommemorativeNftMintBanner'

export const CommemorativeNftDashboard = () => {
  const navigate = useNavigate()
  const ownerAddress = useVerifiedCommemorativeNftOwner()
  const [dialogOwner, setDialogOwner] = useState<Address>()
  const open = !!ownerAddress && dialogOwner === ownerAddress
  const offer = useCommemorativeNftOffer({ ownerAddress, enabled: true })
  const eligibility = offer.visibleEligibility
  const card =
    eligibility && offer.minted
      ? buildCommemorativeNftCardData({
          chainId: offer.availability.chainId,
          eligibility,
          minted: true,
          ownerAddress: eligibility.ownerAddress,
        })
      : undefined
  return (
    <>
      {offer.canRecoverClaim ? (
        <CommemorativeNftMintBanner
          onMint={() => setDialogOwner(ownerAddress)}
          status="pending-claim"
        />
      ) : eligibility &&
        !offer.minted &&
        (offer.migrationCompletion.isComplete ||
          offer.canReconcileMigration) ? (
        <CommemorativeNftMintBanner
          disabled={!offer.canOpenMint}
          onMint={() => setDialogOwner(ownerAddress)}
          status={offer.canReconcileMigration ? 'reconciling' : 'ready'}
        />
      ) : null}
      <CommemorativeNftDashboardSection active={!open} card={card} />
      <CommemorativeNftClaimDialog
        context="mint-later"
        onClose={() => setDialogOwner(undefined)}
        onOpenDashboard={() => {
          setDialogOwner(undefined)
          navigate({ to: '/dashboard' })
        }}
        open={open}
        ownerAddress={ownerAddress}
      />
    </>
  )
}
