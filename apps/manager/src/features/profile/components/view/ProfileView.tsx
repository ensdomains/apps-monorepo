import { Trans } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { CommemorativeNftProfileSection } from '@/features/migration/components/success/CommemorativeNftProfileSection'
import { isEligibleProfileName } from '@/features/migration/components/UpgradeBanner.helpers'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import { isConnectedProfileOwner } from '@/features/profile/components/view/connectedAccounts.helpers'
import { useCanEditRecords } from '@/features/profile/hooks/useCanEditRecords'
import { canEditProfileHere } from '@/features/profile/service/profileEditability'
import {
  getProfileExpiryResultStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { imageRecordQuery } from '@/features/profile/service/profileImageRecord'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { getDefaultHeaderCover } from '@/features/profile/utils/defaultHeaderCover'
import { getThemeVars } from '@/features/profile/utils/themeColor'
import { transformProfileRecords } from '@/features/profile/utils/transformRecords'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { useMigrationNftEnabled } from '@/lib/posthog/useMigrationNftEnabled'
import { useSmartAccountContext } from '@/lib/smart-account'
import { ProfileActions } from './ProfileActions'
import { ProfileBanner } from './ProfileBanner'
import { ProfileCards } from './ProfileCards'
import { type ProfileDraft, ProfileDraftProvider } from './ProfileDraft.context'
import { ProfileHeader } from './ProfileHeader'
import { ProfileLoading } from './ProfileLoading'
import {
  ProfileGracePeriodBanner,
  ProfileMigrationBanner,
} from './ProfileStatusBanners'
import { ProfileThemeColorProvider } from './ProfileThemeColor'

type ProfileViewProps = {
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

const ProfileCommemorativeNftSection = ({
  enabled,
  isOwner,
  name,
}: {
  readonly enabled: boolean
  readonly isOwner: boolean | undefined
  readonly name: string
}) => {
  if (!enabled || !isOwner) return null
  return <CommemorativeNftProfileSection isOwner name={name} />
}

const getImageUrls = (
  draft: ProfileDraft | null,
  avatarData: string | null | undefined,
  headerData: string | null | undefined,
) => ({
  avatarUrl: draft?.avatarPreviewUrl ?? avatarData ?? undefined,
  headerUrl: draft?.headerPreviewUrl ?? headerData ?? undefined,
})

export const ProfileView = ({ name }: ProfileViewProps) => {
  const migrationEnabled = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.MIGRATION,
    false,
  )
  const commemorativeNftEnabled = useMigrationNftEnabled()
  const { isConnected } = useSmartAccountContext()
  const { eligible: eligibleV1Names, isPending: isV1NamesPending } =
    useEligibleV1Names({
      enabled: migrationEnabled,
      fallbackToClassified: false,
    })
  // Use the banner's verified eligibility even when indexed V2 data masks the
  // current V1 owner. This only exposes the upgrade prompt, never the editor.
  const isUpgradeRequired =
    isConnected &&
    migrationEnabled &&
    !isV1NamesPending &&
    isEligibleProfileName(eligibleV1Names, name)
  const { data: profileRecords, refetch: refetchRecords } = useSuspenseQuery({
    ...profileRecordsQuery(name),
  })
  const records = transformProfileRecords(profileRecords)
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const displayRecords = draft?.records ?? records
  const themeVars = getThemeVars(displayRecords.base.theme)

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
  const imageRecords = expiry.isInGrace ? {} : displayRecords.base
  const avatar = useQuery(imageRecordQuery(imageRecords.avatar?.trim()))
  const header = useQuery(imageRecordQuery(imageRecords.header?.trim()))
  const owner = ownerData?.owner as Address | undefined
  const ownerReverseName = useQuery({
    ...profileReverseNameQuery(owner),
  })
  const isOwner = useIsOwner({ owner })
  const resolvedIsOwner = isOwnerPending ? undefined : isOwner
  const canEditRecords = useCanEditRecords({
    enabled: !expiry.isInGrace,
    isOwner: resolvedIsOwner,
    name,
  })
  const ownerMissing = !isOwnerPending && !ownerData?.owner

  if (ownerMissing && isExpiryPending) {
    return <ProfileLoading name={name} />
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

  const { avatarUrl, headerUrl } = getImageUrls(draft, avatar.data, header.data)
  const defaultHeaderUrl = getDefaultHeaderCover({
    isInGrace: expiry.isInGrace,
    themeColor: displayRecords.base.theme,
  })
  const profileThemeColor = expiry.isInGrace
    ? undefined
    : themeVars['--theme-color']
  const hasMobileStatusBanner = migrationEnabled || expiry.isInGrace
  const canEditProfile = canEditProfileHere({
    isInGrace: expiry.isInGrace || isExpiryError,
    canEditRecords,
    isUpgradeRequired,
    name,
    protocol: ownerData?.protocol,
  })

  // Figma page background and bottom padding (sticky bar height plus safe area)
  // have no matching tokens
  return (
    <div
      className="relative -mt-13.5 min-h-screen bg-[#FCFBFB] pb-[calc(117px+env(safe-area-inset-bottom,0))] xl:-mt-20 xl:pb-28.5 xl:data-[owner=true]:pb-44"
      data-owner={resolvedIsOwner === true}
      style={expiry.isInGrace ? undefined : (themeVars as React.CSSProperties)}
    >
      <ProfileThemeColorProvider value={profileThemeColor}>
        <ProfileBanner
          defaultHeaderUrl={defaultHeaderUrl}
          headerLoading={header.isLoading}
          headerUrl={headerUrl}
          name={name}
        />
        <ProfileMigrationBanner
          className="absolute inset-x-4 top-32 z-20 mx-auto hidden max-w-275.5 xl:block"
          isMigrationEnabled={migrationEnabled}
          name={name}
        />
        <ProfileGracePeriodBanner
          className="absolute inset-x-4 top-24.5 z-20 mx-auto hidden max-w-275.5 xl:block"
          expiry={expiry}
          isOwner={resolvedIsOwner}
          name={name}
          protocol={ownerData?.protocol}
        />
        <div className="relative z-10 mx-auto -mt-21 w-full max-w-97.5 space-y-0 xl:-mt-11.25 xl:max-w-226.25">
          <div>
            <ProfileMigrationBanner
              className="mb-6 xl:hidden"
              isMigrationEnabled={migrationEnabled}
              name={name}
            />
            <ProfileGracePeriodBanner
              className="mb-6 xl:hidden"
              expiry={expiry}
              isOwner={resolvedIsOwner}
              name={name}
              protocol={ownerData?.protocol}
            />
            <ProfileHeader
              avatarLoading={avatar.isLoading}
              avatarUrl={avatarUrl}
              canEdit={canEditProfile}
              displayExpiryDate={expiry.displayExpiryDate}
              hasMobileStatusBanner={hasMobileStatusBanner}
              name={name}
              owner={owner}
              ownerReverseName={ownerReverseName.data}
              records={displayRecords}
              registrationDate={registration.data?.registrationDate}
            />
            {isExpiryError ? (
              <p className="px-4 pt-2 text-muted-foreground text-xs">
                <Trans>
                  Couldn’t check when this name expires, so editing is paused
                  until it can be read.
                </Trans>
              </p>
            ) : null}
            <div className="space-y-0">
              <ProfileCards records={displayRecords} />
              <ProfileCommemorativeNftSection
                enabled={commemorativeNftEnabled}
                isOwner={resolvedIsOwner}
                name={name}
              />
            </div>
          </div>
        </div>
        <ProfileDraftProvider value={setDraft}>
          <ProfileActions
            avatarUrl={avatarUrl}
            canEdit={canEditProfile}
            // An unknown expiry could be a grace period, so editing waits too.
            isInGrace={expiry.isInGrace || isExpiryError}
            isOwner={resolvedIsOwner}
            isUpgradeRequired={isUpgradeRequired}
            name={name}
            onUpdated={refetchRecords}
            owner={owner}
            records={records}
            renewalProtocol={ownerData?.protocol}
            url={getProfileUrl(name)}
          />
        </ProfileDraftProvider>
      </ProfileThemeColorProvider>
    </div>
  )
}
