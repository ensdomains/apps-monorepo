import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useConnection } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account'
import { resolveVerifiedOwner } from '@/lib/smart-account/sessionGate'
import { useCommemorativeNftAvailability } from '../../commemorative-nft/useCommemorativeNftAvailability'
import { useCommemorativeNftMigrationCompletion } from '../../commemorative-nft/useCommemorativeNftMigrationCompletion'
import { getVisibleCommemorativeNftEligibility } from '../../commemorative-nft/visibility'
import { CommemorativeNftClaimDialog } from './CommemorativeNftClaimDialog'
import { CommemorativeNftMintBanner } from './CommemorativeNftMintBanner'

export const CommemorativeNftDashboardPrompt = () => {
  const navigate = useNavigate()
  const { ownerAddress } = useSmartAccountContext()
  const { address: walletAddress, isConnected } = useConnection()
  const verifiedOwner =
    resolveVerifiedOwner(
      ownerAddress,
      isConnected ? walletAddress : undefined,
    ) ?? undefined
  const [open, setOpen] = useState(false)
  const availability = useCommemorativeNftAvailability({
    ownerAddress: verifiedOwner,
    enabled: true,
  })
  const migrationCompletion = useCommemorativeNftMigrationCompletion({
    ownerAddress: verifiedOwner,
    enabled:
      availability.featureEnabled &&
      availability.supported &&
      availability.claimed.data !== true,
  })

  // Keep a resolved offer in place during background checks. Mint still
  // requires fresh, idle results and is revalidated again by the claim dialog.
  const eligibility = getVisibleCommemorativeNftEligibility({
    featureEnabled: availability.featureEnabled,
    ownerAddress: verifiedOwner,
    supported: availability.supported,
    result: availability.eligibility.data,
    hasFreshEligibilityResult:
      availability.eligibility.isFetchedAfterMount &&
      availability.eligibility.isSuccess,
    minted: availability.claimed.data === true,
  })
  const shouldShow =
    !!eligibility &&
    migrationCompletion.isComplete &&
    availability.claimed.isFetchedAfterMount &&
    availability.claimed.isSuccess &&
    availability.claimed.data === false
  const canMint =
    availability.hasFreshEligibilityResult &&
    availability.isConfirmedUnclaimed &&
    migrationCompletion.isFreshComplete

  return (
    <>
      {shouldShow ? (
        <CommemorativeNftMintBanner
          disabled={!canMint}
          onMint={() => setOpen(true)}
        />
      ) : null}

      <CommemorativeNftClaimDialog
        context="mint-later"
        onClose={() => setOpen(false)}
        onOpenDashboard={() => {
          setOpen(false)
          navigate({ to: '/dashboard' })
        }}
        onViewProfile={(profileName) => {
          setOpen(false)
          const name = profileName ?? eligibility?.profileName
          if (!name) return
          navigate({
            to: '/$name',
            params: { name },
          })
        }}
        open={open}
        ownerAddress={verifiedOwner}
      />
    </>
  )
}
