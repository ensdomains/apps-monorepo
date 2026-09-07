import { Trans } from '@lingui/react/macro'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { EnsMobileIcon } from '@/assets/icons/ens-mobile-icon'
import { useSmartAccountContext } from '@/lib/smart-account'
import { resolveVerifiedOwner } from '@/lib/smart-account/sessionGate'
import { buildCommemorativeNftCardData } from '../../commemorative-nft/cardData'
import { useCommemorativeNftAvailability } from '../../commemorative-nft/useCommemorativeNftAvailability'
import { getVisibleCommemorativeNftEligibility } from '../../commemorative-nft/visibility'
import { CommemorativeNftCard } from './CommemorativeNftCard'
import type { CommemorativeNftCardData } from './MigrationSuccessDialog.types'

export const CommemorativeNftDashboardCard = ({
  card,
}: {
  readonly card: CommemorativeNftCardData
}) => (
  <section className="flex w-full flex-col items-center gap-6 rounded-[11px] bg-[#FCFBFB] px-2 py-3 md:gap-4">
    <h2 className="flex max-w-full items-center justify-center gap-2 text-center font-sans text-base text-ens-garnet-500 leading-[1.05] tracking-[0.02em] md:text-[28px]">
      <EnsMobileIcon className="h-4 w-3.5 md:h-7 md:w-6" />
      <span className="min-w-0 text-balance">
        <Trans>Welcome to ENSv2</Trans>
      </span>
    </h2>
    <CommemorativeNftCard
      interactive={false}
      state={{ status: 'minted', card }}
      variant="dialog"
    />
  </section>
)

export const CommemorativeNftDashboardSection = () => {
  const { ownerAddress } = useSmartAccountContext()
  const { address: walletAddress, isConnected } = useConnection()
  // The smart-account context can retain the previous owner during a switch.
  const address =
    resolveVerifiedOwner(
      ownerAddress as Address | undefined,
      isConnected ? walletAddress : undefined,
    ) ?? undefined
  const availability = useCommemorativeNftAvailability({
    ownerAddress: address,
    enabled: true,
  })
  const minted = availability.claimed.data === true
  const eligibility = getVisibleCommemorativeNftEligibility({
    ownerAddress: address,
    supported: availability.supported,
    result: availability.eligibility.data,
    hasFreshEligibilityResult: availability.hasFreshEligibilityResult,
    minted,
  })
  const card = useMemo(() => {
    if (!address || !availability.supported || !eligibility || !minted)
      return undefined

    return buildCommemorativeNftCardData({
      chainId: availability.chainId,
      eligibility,
      migratedAt: new Date(),
      migratedNameCount: 0,
      minted: true,
      ownerAddress: address,
    })
  }, [
    address,
    availability.chainId,
    availability.supported,
    eligibility,
    minted,
  ])

  if (!card) return null
  return <CommemorativeNftDashboardCard card={card} />
}
