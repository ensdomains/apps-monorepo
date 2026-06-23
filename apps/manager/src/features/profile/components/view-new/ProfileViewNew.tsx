import { Trans } from '@lingui/react/macro'
import { useQueries, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { isConnectedProfileOwner } from '@/features/profile/components/view/ProfileView.helpers'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import {
  getProfileNameExpiryStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { getThemeVars } from '@/features/profile/utils/themeColor'
import { transformProfileRecords } from '@/features/profile/utils/transformRecords'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useSmartAccountContext } from '@/lib/smart-account'
import { ProfileViewNewActions } from './ProfileViewNewActions'
import { ProfileViewNewBanner } from './ProfileViewNewBanner'
import { ProfileViewNewCards } from './ProfileViewNewCards'
import { ProfileViewNewHeader } from './ProfileViewNewHeader'
import { ProfileViewNewLoading } from './ProfileViewNewLoading'
import { ProfileViewNewStatusBanners } from './ProfileViewNewStatusBanners'

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
  const migrationEnabled = useFeatureFlag('MIGRATION')
  const profileEditNewEnabled = useFeatureFlag('PROFILE_EDIT_NEW')
  const { data: profileRecords, refetch: refetchRecords } = useSuspenseQuery({
    ...profileRecordsQuery(name),
  })
  const records = transformProfileRecords(profileRecords)
  const themeVars = getThemeVars(records.base.theme) as React.CSSProperties

  const [avatar, header] = useQueries({
    queries: [
      parseAvatarQuery(records.base.avatar),
      parseAvatarQuery(records.base.header),
    ],
  })

  const { data: ownerData, isPending: isOwnerPending } = useQuery({
    ...profileOwnerQuery(name),
  })
  const {
    data: expiryData,
    isPending: isExpiryPending,
    isError: isExpiryError,
    error: expiryError,
  } = useQuery({
    ...profileExpiryQuery(name),
  })
  const registration = useQuery({
    ...profileRegistrationQuery(name),
  })

  const expiry = getProfileNameExpiryStatus(expiryData?.expiry, true)
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

  const avatarUrl = expiry.isInGrace
    ? undefined
    : (avatar.data ?? records.base.avatar)
  const headerUrl = expiry.isInGrace
    ? undefined
    : (header.data ?? records.base.header)

  return (
    <div
      className="relative min-h-screen bg-[#FCFBFB] pb-[calc(117px+env(safe-area-inset-bottom,0))] lg:landscape:pb-28.5"
      style={expiry.isInGrace ? undefined : themeVars}
    >
      <ProfileViewNewBanner
        headerLoading={header.isLoading}
        headerUrl={headerUrl}
        name={name}
      />
      <div className="relative z-10 mx-auto -mt-21 w-full max-w-97.5 space-y-0 lg:landscape:-mt-17.25 lg:landscape:max-w-226.25">
        <div>
          <ProfileViewNewStatusBanners
            expiry={expiry}
            isMigrationEnabled={migrationEnabled}
            name={name}
          />
          <ProfileViewNewHeader
            avatarLoading={avatar.isLoading}
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
        profileEditNewEnabled={profileEditNewEnabled}
        records={records}
        url={getProfileUrl(name)}
      />
    </div>
  )
}
