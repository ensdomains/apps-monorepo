import { Trans } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { isConnectedProfileOwner } from '@/features/profile/components/view/ProfileView.helpers'
import {
  buildNameAvatarUrl,
  buildNameHeaderUrl,
} from '@/features/profile/service/profileAvatar'
import {
  getProfileExpiryResultStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { getDefaultHeaderCover } from '@/features/profile/utils/defaultHeaderCover'
import { getThemeVars } from '@/features/profile/utils/themeColor'
import { transformProfileRecords } from '@/features/profile/utils/transformRecords'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { useSmartAccountContext } from '@/lib/smart-account'
import { ProfileViewNewActions } from './ProfileViewNewActions'
import { ProfileViewNewBanner } from './ProfileViewNewBanner'
import { ProfileViewNewCards } from './ProfileViewNewCards'
import { ProfileViewNewHeader } from './ProfileViewNewHeader'
import { ProfileViewNewLoading } from './ProfileViewNewLoading'
import {
  ProfileViewNewGracePeriodBanner,
  ProfileViewNewMigrationBanner,
} from './ProfileViewNewStatusBanners'
import { ProfileViewNewThemeColorProvider } from './ProfileViewNewThemeColor'

type ProfileViewNewProps = {
  readonly name: string
}

type UseIsOwnerParams = {
  readonly owner: Address | undefined
}

const useIsOwner = ({ owner }: UseIsOwnerParams) => {
  const { address } = useConnection()
  const { accountAddress: smartAccountAddress, ownerAddress } =
    useSmartAccountContext()

  return isConnectedProfileOwner({
    owner,
    walletAddress: address,
    accountAddress: smartAccountAddress,
    ownerAddress,
  })
}

const getProfileUrl = (name: string) =>
  `${
    typeof window === 'undefined'
      ? 'https://app.ens.domains'
      : window.location.origin
  }/p/${name}`

export const ProfileViewNew = ({ name }: ProfileViewNewProps) => {
  const migrationEnabled = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.MIGRATION,
    false,
  )
  const { data: profileRecords, refetch: refetchRecords } = useSuspenseQuery({
    ...profileRecordsQuery(name),
  })
  const records = transformProfileRecords(profileRecords)
  const themeVars = getThemeVars(records.base.theme)

  const { data: ownerData, isPending: isOwnerPending } = useQuery({
    ...profileOwnerQuery(name),
  })
  const {
    data: expiryData,
    isPending: isExpiryPending,
    isError: isExpiryError,
    error: expiryError,
  } = useQuery({
    ...profileExpiryQuery(name, ownerData?.protocol),
  })
  const registration = useQuery({
    ...profileRegistrationQuery(name, ownerData?.protocol),
  })

  const expiry = getProfileExpiryResultStatus(expiryData)
  const owner = ownerData?.owner as Address | undefined
  const ownerReverseName = useQuery({
    ...profileReverseNameQuery(owner),
  })
  const isOwner = useIsOwner({ owner })
  const ownerMissing = !isOwnerPending && !ownerData?.owner

  if (ownerMissing && isExpiryPending) {
    return <ProfileViewNewLoading name={name} />
  }

  if (ownerMissing && isExpiryError) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-8">
        <p className="text-foreground text-sm">
          <Trans>Failed to load registration data for this name.</Trans>
        </p>
        {expiryError?.message ? (
          <p className="text-muted-foreground text-xs">{expiryError.message}</p>
        ) : null}
      </div>
    )
  }

  const avatarUrl = expiry.isInGrace ? undefined : buildNameAvatarUrl(name)
  const headerUrl =
    expiry.isInGrace || !records.base.header?.trim()
      ? undefined
      : buildNameHeaderUrl(name)
  const defaultHeaderUrl = getDefaultHeaderCover({
    isInGrace: expiry.isInGrace,
    themeColor: records.base.theme,
  })
  const profileThemeColor = expiry.isInGrace
    ? undefined
    : themeVars['--theme-color']

  return (
    <div
      className="relative -mt-13.5 min-h-screen bg-[#FCFBFB] pb-[calc(117px+env(safe-area-inset-bottom,0))] lg:landscape:-mt-20 lg:landscape:pb-28.5"
      style={expiry.isInGrace ? undefined : (themeVars as React.CSSProperties)}
    >
      <ProfileViewNewThemeColorProvider value={profileThemeColor}>
        <ProfileViewNewBanner
          defaultHeaderUrl={defaultHeaderUrl}
          headerLoading={false}
          headerUrl={headerUrl}
          name={name}
        />
        <ProfileViewNewMigrationBanner
          className="absolute inset-x-4 top-32 z-20 mx-auto hidden max-w-275.5 lg:landscape:block"
          isMigrationEnabled={migrationEnabled}
          name={name}
        />
        <ProfileViewNewGracePeriodBanner
          className="absolute inset-x-4 top-24.5 z-20 mx-auto hidden max-w-275.5 lg:landscape:block"
          expiry={expiry}
          isOwner={isOwnerPending ? undefined : isOwner}
          name={name}
        />
        <div className="relative z-10 mx-auto -mt-21 w-full max-w-97.5 space-y-0 lg:landscape:-mt-11.25 lg:landscape:max-w-226.25">
          <div>
            <ProfileViewNewMigrationBanner
              className="mb-6 lg:landscape:hidden"
              isMigrationEnabled={migrationEnabled}
              name={name}
            />
            <ProfileViewNewGracePeriodBanner
              className="mb-6 lg:landscape:hidden"
              expiry={expiry}
              isOwner={isOwnerPending ? undefined : isOwner}
              name={name}
            />
            <ProfileViewNewHeader
              avatarLoading={false}
              avatarUrl={avatarUrl}
              displayExpiryDate={expiry.displayExpiryDate}
              name={name}
              owner={owner}
              ownerReverseName={ownerReverseName.data}
              records={records}
              registrationDate={registration.data?.registrationDate}
            />
            <div className="space-y-0">
              <ProfileViewNewCards
                avatarUrl={avatarUrl}
                name={name}
                records={records}
              />
            </div>
          </div>
        </div>
        <ProfileViewNewActions
          avatarUrl={avatarUrl}
          isInGrace={expiry.isInGrace}
          isOwner={isOwnerPending ? undefined : isOwner}
          name={name}
          onUpdated={refetchRecords}
          owner={owner}
          records={records}
          url={getProfileUrl(name)}
        />
      </ProfileViewNewThemeColorProvider>
    </div>
  )
}
