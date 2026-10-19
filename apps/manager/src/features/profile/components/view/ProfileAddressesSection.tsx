import { Trans } from '@lingui/react/macro'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Card } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { IconRenderer } from '@/features/profile/components/IconRenderer'
import type { ProfileRecords } from '@/features/profile/types'
import {
  ProfileCard,
  profileCardCopyIconClassName,
  profileCardTrailingIconStrokeWidth,
} from './ProfileCard'
import {
  formatChainSpecificAddress,
  getChainSpecificAddresses,
  getMainReceivingAddress,
  getReceivingAddressChains,
  type ProfileAddressItem,
} from './ProfileView.helpers'

type ProfileAddressesSectionProps = {
  readonly records: ProfileRecords
}

// A 24px icon row inside 24px padding, so every address card is 72px tall.
const addressCardClassName =
  'h-auto min-h-18 w-full flex-row items-center justify-between gap-3 rounded-xl border-[0.25px] border-ens-quartz-300 p-6 shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition has-[>svg]:px-6 hover:bg-ens-quartz-50'

const AddressValue = ({ value }: { readonly value: string }) => (
  <span className="min-w-0 truncate font-mono text-[13px] text-ens-quartz-400 leading-[1.1] tracking-[-0.26px] xl:text-sm xl:tracking-[-0.28px]">
    {formatChainSpecificAddress(value)}
  </span>
)

const ChainIconTooltip = ({
  chain,
}: {
  readonly chain: ProfileAddressItem
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        aria-label={chain.label}
        className="inline-flex size-6 shrink-0"
        role="img"
        title=""
      >
        <IconRenderer className="size-6 object-contain" icon={chain.icon} />
      </span>
    </TooltipTrigger>
    <TooltipContent>{chain.label}</TooltipContent>
  </Tooltip>
)

const ReceivingChainIcons = ({
  chains,
}: {
  readonly chains: readonly ProfileAddressItem[]
}) => {
  const withIcon = chains.filter((chain) => chain.icon)
  if (withIcon.length === 0) return null

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {withIcon.map((chain) => (
        <ChainIconTooltip
          chain={chain}
          key={`${chain.coinType}-${chain.value}`}
        />
      ))}
    </div>
  )
}

const MainAddressCard = ({
  address,
  chains,
}: {
  readonly address: ProfileAddressItem
  readonly chains: readonly ProfileAddressItem[]
}) => (
  <Card asChild className={addressCardClassName}>
    <CopyableButton
      iconClassName={profileCardCopyIconClassName}
      iconStrokeWidth={profileCardTrailingIconStrokeWidth}
      value={address.value}
      variant="ghost"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ReceivingChainIcons chains={chains} />
        <AddressValue value={address.value} />
      </div>
    </CopyableButton>
  </Card>
)

const ChainAddressCard = ({
  address,
}: {
  readonly address: ProfileAddressItem
}) => (
  <Card asChild className={addressCardClassName}>
    <CopyableButton
      iconClassName={profileCardCopyIconClassName}
      iconStrokeWidth={profileCardTrailingIconStrokeWidth}
      value={address.value}
      variant="ghost"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ChainIconTooltip chain={address} />
        <AddressValue value={address.value} />
      </div>
    </CopyableButton>
  </Card>
)

export const ProfileAddressesSection = ({
  records,
}: ProfileAddressesSectionProps) => {
  const mainAddress = getMainReceivingAddress(records)
  const receivingChains = getReceivingAddressChains(records)
  const chainAddresses = getChainSpecificAddresses(records)

  if (!mainAddress && chainAddresses.length === 0) return null

  return (
    <ProfileCard title={<Trans>Addresses</Trans>}>
      <div className="flex flex-col gap-3 xl:gap-6">
        {mainAddress ? (
          <MainAddressCard address={mainAddress} chains={receivingChains} />
        ) : null}
        {chainAddresses.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3 xl:gap-6 min-[375px]:grid-cols-2">
            {chainAddresses.map((address) => (
              <ChainAddressCard
                address={address}
                key={`${address.coinType}-${address.value}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </ProfileCard>
  )
}
