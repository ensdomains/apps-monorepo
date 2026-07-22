import { Trans } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { GracePeriodBanner } from '@/features/grace/components/GracePeriodBanner'
import { UpgradeBanner } from '@/features/migration/components/UpgradeBanner'
import { ProfileLoading } from '@/features/profile/components/common/ProfileLoading'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { useSmartAccountContext } from '@/lib/smart-account'
import { sectionsList } from '../../data/records'
import {
  getProfileExpiryResultStatus,
  profileExpiryQuery,
} from '../../service/profileExpiry'
import { profileOwnerQuery } from '../../service/profileOwner'
import { profileRecordsQuery } from '../../service/profileRecords'
import { getThemeVars } from '../../utils/themeColor'
import { transformProfileRecords } from '../../utils/transformRecords'
import { EditProfileDialog } from '../dialogs/edit-profile/EditProfileDialog'
import { ProfileViewNew } from '../view-new/ProfileViewNew'
import { isConnectedProfileOwner } from './ProfileView.helpers'
import { ViewBioSection } from './ViewBioSection'
import { ViewCryptoSection } from './ViewCryptoSection'
import { ViewDynamicSection } from './ViewDynamicSection'
import { ViewHeaderSection } from './ViewHeaderSection'
import { ViewLinksSection } from './ViewLinksSection'

interface ProfileViewProps {
  name: string
  profileViewNewEnabled?: boolean
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

export const ProfileView = ({
  name,
  profileViewNewEnabled = false,
}: ProfileViewProps) => {
  return profileViewNewEnabled ? (
    <ProfileViewNew name={name} />
  ) : (
    <ProfileViewCurrent name={name} />
  )
}

const ProfileViewCurrent = ({ name }: ProfileViewProps) => {
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
  const expiry = getProfileExpiryResultStatus(expiryData)

  const owner = ownerData?.owner as Address | undefined
  const profileThemeColor = expiry.isInGrace
    ? undefined
    : themeVars['--theme-color']

  const isOwner = useIsOwner({
    owner,
  })

  const gracePeriodBanner = match(expiry)
    .with(
      { isInGrace: true, graceEndDate: P.not(P.nullish) },
      ({ graceEndDate }) =>
        isOwnerPending ? null : (
          <GracePeriodBanner
            graceEndDate={graceEndDate}
            renewName={name}
            variant={isOwner ? 'profileOwnName' : 'profileNotOwnedName'}
          />
        ),
    )
    .otherwise(() => null)

  // Registry ownerOf is zero when expired; expiry distinguishes v2 grace from missing.
  const ownerMissing = !isOwnerPending && !ownerData?.owner

  if (ownerMissing && isExpiryPending) {
    return <ProfileLoading />
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

  return (
    <div
      className="mx-auto mb-12 w-full max-w-7xl space-y-4 pt-4 md:w-[calc(100%-4rem)]"
      style={expiry.isInGrace ? undefined : themeVars}
    >
      {migrationEnabled && <UpgradeBanner profileName={name} />}
      <div className="relative">
        {gracePeriodBanner ? (
          <div className="mb-4 md:absolute md:inset-x-4 md:top-4 md:z-10 md:mb-0">
            {gracePeriodBanner}
          </div>
        ) : null}
        <ViewHeaderSection
          hasHeader={Boolean(records.base.header?.trim())}
          isInGrace={expiry.isInGrace}
          isOwner={isOwnerPending ? undefined : isOwner}
          name={name}
          owner={owner}
          themeColor={profileThemeColor}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {/* Left/main column */}
        <div className="space-y-4 md:col-span-7 lg:col-span-8">
          <ViewBioSection records={records} />
          {sectionsList.map((section) => (
            <ViewDynamicSection
              key={section}
              records={records}
              section={section}
            />
          ))}
        </div>

        {/* Right/side column */}
        <div className="space-y-4 md:col-span-5 lg:col-span-4">
          <ViewCryptoSection records={records} />
          <ViewLinksSection records={records} />

          {isOwner && !expiry.isInGrace && (
            <div className="space-y-2">
              <EditProfileDialog
                name={name}
                onUpdated={refetchRecords}
                owner={owner}
                records={records}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
