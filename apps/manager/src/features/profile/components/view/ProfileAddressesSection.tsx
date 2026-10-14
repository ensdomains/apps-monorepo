import { Trans } from '@lingui/react/macro'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { Card } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { IconRenderer } from '@/features/profile/components/IconRenderer'
import type { ProfileRecords } from '@/features/profile/types'
import { cn, truncateAddress } from '@/lib/utils'
import {
  ProfileCard,
  profileCardCopyIconClassName,
  profileCardTrailingIconStrokeWidth,
} from './ProfileCard'
import { useProfileThemeColor } from './ProfileThemeColor'
import {
  formatChainSpecificAddress,
  getChainSpecificAddresses,
  getMainReceivingAddress,
  getReceivingAddressChains,
  type ProfileAddressItem,
} from './ProfileView.helpers'

type ProfileAddressesSectionProps = {
  readonly avatarUrl?: string
  readonly name: string
  readonly records: ProfileRecords
}

const addressCardPaddingClassName =
  'has-[>svg]:px-4 profile-desktop:p-[24.25px] profile-desktop:has-[>svg]:px-[24.25px]'
const addressCardSurfaceClassName =
  'flex-row items-center rounded-[14px] transition hover:bg-ens-quartz-50 profile-desktop:rounded-xl'

const AddressValue = ({
  className = '',
  value,
}: {
  readonly className?: string
  readonly value: string
}) => (
  <span
    className={`truncate font-mono profile-desktop:text-[13px] text-[12px] profile-desktop:tracking-[0.91px] tracking-[0.84px] ${className}`}
  >
    {truncateAddress(value)}
  </span>
)

const ChainAddressValue = ({ value }: { readonly value: string }) => (
  <span
    className="profile-desktop:w-21.25 min-w-0 truncate profile-desktop:text-sm text-[13px] text-ens-quartz-400 leading-[1.2] profile-desktop:leading-[1.1] profile-desktop:tracking-[-0.28px] tracking-[-0.26px]"
    title={value}
  >
    {formatChainSpecificAddress(value)}
  </span>
)

const ChainIconTooltip = ({
  chain,
  iconClassName,
  triggerClassName,
}: {
  readonly chain: ProfileAddressItem
  readonly iconClassName: string
  readonly triggerClassName?: string
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        aria-label={chain.label}
        className={triggerClassName}
        role="img"
        title=""
      >
        <IconRenderer className={iconClassName} icon={chain.icon} />
      </span>
    </TooltipTrigger>
    <TooltipContent>{chain.label}</TooltipContent>
  </Tooltip>
)

const ReceivingChainIcons = ({
  chains,
}: {
  readonly chains: ProfileAddressItem[]
}) => {
  const withIcon = chains.filter((chain) => chain.icon)
  if (withIcon.length === 0) return null

  return (
    <div className="flex profile-desktop:min-w-50 max-w-full shrink-0 flex-wrap items-center gap-1">
      {withIcon.map((chain) => (
        <ChainIconTooltip
          chain={chain}
          iconClassName="size-4.5 object-contain profile-desktop:size-6.5"
          key={`${chain.coinType}-${chain.value}`}
          triggerClassName="inline-flex shrink-0"
        />
      ))}
    </div>
  )
}

const MainAddressCard = ({
  address,
  avatarUrl,
  chains,
  name,
}: {
  readonly address: ProfileAddressItem
  readonly avatarUrl?: string
  readonly chains: ProfileAddressItem[]
  readonly name: string
}) => {
  const themeColor = useProfileThemeColor()

  return (
    <Card
      asChild
      className={`${addressCardSurfaceClassName} ${addressCardPaddingClassName} h-auto min-h-13.75 w-full profile-desktop:max-w-141 justify-between gap-2 py-4`}
    >
      <CopyableButton
        iconClassName={profileCardCopyIconClassName}
        iconStrokeWidth={profileCardTrailingIconStrokeWidth}
        value={address.value}
        variant="ghost"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="flex profile-desktop:h-6.5 min-w-0 items-center gap-2 profile-desktop:gap-4">
            <div className="flex min-w-0 items-center gap-1">
              <div className="profile-desktop:size-[25.576px] size-5.5 shrink-0 overflow-hidden profile-desktop:rounded-sm rounded-full bg-ens-quartz-100">
                <ImageFallback.Root className="contents">
                  <ImageFallback.Image
                    alt={`${name} avatar`}
                    className="size-full object-cover"
                    src={avatarUrl}
                  />
                  <ImageFallback.Fallback>
                    <PatternAvatar
                      className="size-full rounded-sm border-none bg-transparent p-0 shadow-none"
                      color={themeColor}
                      name={name}
                    />
                  </ImageFallback.Fallback>
                </ImageFallback.Root>
              </div>
              <span className="truncate font-semi-mono profile-desktop:text-sm text-[13px] text-ens-quartz-900 profile-desktop:leading-[0.96] profile-desktop:tracking-[-0.28px]">
                {name}
              </span>
            </div>
            <AddressValue
              className="text-ens-quartz-900"
              value={address.value}
            />
          </div>
          <ReceivingChainIcons chains={chains} />
        </div>
      </CopyableButton>
    </Card>
  )
}

const ChainAddressCard = ({
  address,
}: {
  readonly address: ProfileAddressItem
}) => (
  <Card
    asChild
    className={cn(
      addressCardSurfaceClassName,
      addressCardPaddingClassName,
      'h-16.25 profile-desktop:h-auto profile-desktop:min-h-[88.5px] w-full justify-between gap-1 profile-desktop:gap-2 profile-desktop:px-[24.25px] px-2 py-0 has-[>svg]:px-2 profile-desktop:has-[>svg]:px-[24.25px]',
    )}
  >
    <CopyableButton
      iconClassName={profileCardCopyIconClassName}
      iconStrokeWidth={profileCardTrailingIconStrokeWidth}
      value={address.value}
      variant="ghost"
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 profile-desktop:gap-0">
        <ChainIconTooltip
          chain={address}
          iconClassName="size-6 object-contain profile-desktop:size-7"
          triggerClassName="flex size-6 shrink-0 items-center justify-center profile-desktop:size-10 profile-desktop:p-2"
        />
        <ChainAddressValue value={address.value} />
      </div>
    </CopyableButton>
  </Card>
)

export const ProfileAddressesSection = ({
  avatarUrl,
  name,
  records,
}: ProfileAddressesSectionProps) => {
  const mainAddress = getMainReceivingAddress(records)
  const receivingChains = getReceivingAddressChains(records)
  const chainAddresses = getChainSpecificAddresses(records)

  if (!mainAddress && chainAddresses.length === 0) return null

  return (
    <ProfileCard title={<Trans>Addresses</Trans>}>
      <div className="space-y-6">
        {mainAddress ? (
          <div>
            <h3 className="mb-3 text-ens-quartz-600 text-sm leading-normal">
              <Trans>Main receiving address</Trans>
            </h3>
            <MainAddressCard
              address={mainAddress}
              avatarUrl={avatarUrl}
              chains={receivingChains}
              name={name}
            />
          </div>
        ) : null}
        {chainAddresses.length > 0 ? (
          <div>
            <h3 className="mb-3 text-ens-quartz-600 text-sm leading-normal">
              <Trans>Chain-specific addresses</Trans>
            </h3>
            <div className="grid grid-cols-1 profile-desktop:grid-cols-3 gap-3 profile-desktop:gap-6 min-[375px]:grid-cols-2">
              {chainAddresses.map((address) => (
                <ChainAddressCard
                  address={address}
                  key={`${address.coinType}-${address.value}`}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ProfileCard>
  )
}
