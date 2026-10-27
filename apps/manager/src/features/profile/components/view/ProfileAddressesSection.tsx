import { Trans, useLingui } from '@lingui/react/macro'
import { useId } from 'react'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Card } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AddressIcon } from '@/features/profile/components/AddressIcon'
import type { ProfileRecords } from '@/features/profile/types'
import { cn } from '@/lib/utils'
import {
  ProfileCard,
  profileCardCopyIconClassName,
  profileCardTrailingIconStrokeWidth,
  profileFieldLabelClassName,
  profileFieldValueClassName,
  profileTileClassName,
} from './ProfileCard'
import {
  formatProfileAddress,
  getChainSpecificAddresses,
  getMainReceivingAddress,
  getReceivingAddressChains,
  type ProfileAddressItem,
} from './ProfileView.helpers'

type ProfileAddressesSectionProps = {
  readonly records: ProfileRecords
}

const COMPACT_CHAIN_COUNT = 5

// 24px padding, matching the about and contact cards. The svg override
// keeps Button's has-[>svg] padding from shrinking the horizontal inset.
const addressCardClassName = cn(
  profileTileClassName,
  'h-auto min-h-16 w-full flex-row items-center justify-between gap-3 p-6 transition hover:bg-ens-quartz-50 has-[>svg]:px-6',
)

const AddressValue = ({ value }: { readonly value: string }) => (
  <span className={cn('min-w-0 truncate', profileFieldValueClassName)}>
    {formatProfileAddress(value)}
  </span>
)

const ReceivingChainBadge = ({
  chain,
  isCompact,
}: {
  readonly chain: ProfileAddressItem
  readonly isCompact: boolean
}) => {
  const badge = (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-ens-quartz-50 text-ens-quartz-600 text-xs',
        isCompact ? 'p-1' : 'px-2 py-1',
      )}
    >
      <AddressIcon
        coinType={chain.coinType}
        shouldShowFallbackLabel={isCompact}
        size="lg"
      />
      <span className={isCompact ? 'sr-only' : 'min-w-0 break-words'}>
        {chain.label}
      </span>
    </span>
  )

  if (!isCompact) return badge
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{chain.label}</TooltipContent>
    </Tooltip>
  )
}

const ReceivingChainBadges = ({
  chains,
  id,
}: {
  readonly chains: readonly ProfileAddressItem[]
  readonly id: string
}) => {
  const isCompact = chains.length >= COMPACT_CHAIN_COUNT
  return (
    <div
      className="flex min-w-0 max-w-full flex-wrap items-center gap-2 whitespace-normal text-left font-sans"
      id={id}
    >
      {chains.map((chain) => (
        <ReceivingChainBadge
          chain={chain}
          isCompact={isCompact}
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
}) => {
  const { t } = useLingui()
  const chainsId = useId()

  return (
    <Card asChild className={addressCardClassName}>
      <CopyableButton
        aria-describedby={chainsId}
        aria-label={t`Copy address ${address.value}`}
        iconClassName={profileCardCopyIconClassName}
        iconStrokeWidth={profileCardTrailingIconStrokeWidth}
        value={address.value}
        variant="ghost"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <ReceivingChainBadges chains={chains} id={chainsId} />
          <AddressValue value={address.value} />
        </div>
      </CopyableButton>
    </Card>
  )
}

const ChainAddressCard = ({
  address,
}: {
  readonly address: ProfileAddressItem
}) => {
  const { t } = useLingui()

  return (
    <Card asChild className={addressCardClassName}>
      <CopyableButton
        aria-label={t`Copy ${address.label} address ${address.value}`}
        iconClassName={profileCardCopyIconClassName}
        iconStrokeWidth={profileCardTrailingIconStrokeWidth}
        value={address.value}
        variant="ghost"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <AddressIcon coinType={address.coinType} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col text-left">
            <span
              className={cn(
                'whitespace-normal break-words',
                profileFieldLabelClassName,
              )}
            >
              {address.label}
            </span>
            <AddressValue value={address.value} />
          </div>
        </div>
      </CopyableButton>
    </Card>
  )
}

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
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3 xl:gap-6">
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
