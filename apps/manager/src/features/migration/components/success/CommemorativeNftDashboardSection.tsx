import { Trans } from '@lingui/react/macro'
import { EnsMobileIcon } from '@/assets/icons/ens-mobile-icon'
import { CommemorativeNftCard } from './CommemorativeNftCard'
import type { CommemorativeNftCardData } from './MigrationSuccessDialog.types'

export const CommemorativeNftDashboardCard = ({
  card,
  active = true,
}: {
  readonly card: CommemorativeNftCardData
  readonly active?: boolean
}) => (
  // Keep the NFT frame's 11px radius and warm off-white surface; the theme has no exact equivalents.
  <section className="flex w-full flex-col items-center gap-6 rounded-[11px] bg-[#FCFBFB] px-2 py-3 md:gap-4">
    {/* The 28px desktop title aligns with the 28px ENS mark; custom leading and tracking keep this compact heading balanced above the artwork. */}
    <h2 className="flex max-w-full items-center justify-center gap-2 text-center font-sans text-base text-ens-garnet-500 leading-[1.05] tracking-[0.02em] md:text-[28px]">
      <EnsMobileIcon className="h-4 w-3.5 md:h-7 md:w-6" />
      <span className="min-w-0 text-balance">
        <Trans>Welcome to ENSv2</Trans>
      </span>
    </h2>
    <CommemorativeNftCard
      active={active}
      interactive={false}
      state={{ status: 'minted', card }}
      variant="dialog"
    />
  </section>
)

export const CommemorativeNftDashboardSection = ({
  card,
  active = true,
}: {
  readonly card: CommemorativeNftCardData | undefined
  readonly active?: boolean
}) =>
  card ? <CommemorativeNftDashboardCard active={active} card={card} /> : null
