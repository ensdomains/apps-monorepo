import { Trans } from '@lingui/react/macro'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import { useAccount } from 'wagmi'
import { LinkButton } from '@/components/ui/button'
import { GracePeriodBanner } from '@/features/grace/components/GracePeriodBanner'
import { UpgradeBanner } from '@/features/migration/components/UpgradeBanner'
import { ProfileLoading } from '@/features/profile/components/common/ProfileLoading'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useSmartAccountContext } from '@/lib/smart-account'
import { sectionsList } from '../../data/records'
import {
  getProfileNameExpiryStatus,
  profileExpiryQuery,
} from '../../service/profileExpiry'
import { profileOwnerQuery } from '../../service/profileOwner'
import {
  type ProfileRecordsResult,
  profileRecordsQuery,
} from '../../service/profileRecords'
import { getThemeVars } from '../../utils/themeColor'
import { transformProfileRecords } from '../../utils/transformRecords'
import { EditProfileDialog } from '../dialogs/EditProfileDialog'
import { ViewBioSection } from './ViewBioSection'
import { ViewCryptoSection } from './ViewCryptoSection'
import { ViewDynamicSection } from './ViewDynamicSection'
import { ViewHeaderSection } from './ViewHeaderSection'
import { ViewLinksSection } from './ViewLinksSection'

// Hidden for alpha - users don't need to change the resolver
// import { ViewResolverSection } from './ViewResolverSection'

interface ProfileViewProps {
  name: string
}

const hasConfiguredProfileRecords = ({
  texts,
  coins,
  contentHash,
  abi,
}: ProfileRecordsResult): boolean =>
  texts.length > 0 ||
  coins.length > 0 ||
  Boolean(contentHash?.trim()) ||
  Boolean(abi?.trim())

type UseOwnerRedirectParams = {
  readonly name: string
  readonly isProfileEmpty: boolean
  readonly isInGrace: boolean
  readonly owner: Address | undefined
  readonly isOwnerPending: boolean
}

const useOwnerRedirect = ({
  name,
  isProfileEmpty,
  isInGrace,
  owner,
  isOwnerPending,
}: UseOwnerRedirectParams) => {
  const navigate = useNavigate()
  const { address } = useAccount()
  const { accountAddress: smartAccountAddress } = useSmartAccountContext()

  const normalizedOwner = owner?.toLowerCase()
  const connectedAddresses = [address, smartAccountAddress].filter(
    (addr): addr is `0x${string}` => Boolean(addr),
  )
  const isOwner =
    !!normalizedOwner &&
    connectedAddresses.some((addr) => addr.toLowerCase() === normalizedOwner)

  const shouldRedirectToEdit = isOwner && isProfileEmpty && !isInGrace

  useEffect(() => {
    if (shouldRedirectToEdit) {
      navigate({ to: '/p/$name/edit', params: { name }, replace: true })
    }
  }, [shouldRedirectToEdit, navigate, name])

  return {
    isOwner,
    shouldHide: (isOwner || isOwnerPending) && isProfileEmpty && !isInGrace,
  }
}

export const ProfileView = ({ name }: ProfileViewProps) => {
  const migrationEnabled = useFeatureFlag('MIGRATION')
  const profileEditNewEnabled = useFeatureFlag('PROFILE_EDIT_NEW')
  const { data: profileRecords, refetch: refetchRecords } = useSuspenseQuery({
    ...profileRecordsQuery(name),
  })
  const records = transformProfileRecords(profileRecords)
  const themeVars = getThemeVars(records.base.theme) as React.CSSProperties
  const isProfileEmpty = !hasConfiguredProfileRecords(profileRecords)

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
  const expiry = getProfileNameExpiryStatus(expiryData?.expiry, true)

  const owner = ownerData?.owner as Address | undefined

  const { isOwner, shouldHide } = useOwnerRedirect({
    name,
    isProfileEmpty,
    isInGrace: expiry.isInGrace,
    owner,
    isOwnerPending,
  })

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

  if (shouldHide) {
    return null
  }

  return (
    <div
      className="mx-auto mb-12 w-full max-w-7xl space-y-4 pt-4 md:w-[calc(100%-4rem)]"
      style={expiry.isInGrace ? undefined : themeVars}
    >
      {migrationEnabled && isOwner && <UpgradeBanner />}
      {match(expiry)
        .with(
          { isInGrace: true, graceEndDate: P.not(P.nullish) },
          ({ graceEndDate }) => (
            <GracePeriodBanner
              graceEndDate={graceEndDate}
              renewName={name}
              variant="profileOwnName"
            />
          ),
        )
        .otherwise(() => null)}
      <ViewHeaderSection
        isInGrace={expiry.isInGrace}
        name={name}
        owner={owner}
        records={records}
      />
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
          {/* Hidden for alpha - users don't need to change the resolver
          <ViewResolverSection resolverAddress={records.resolverAddress} /> */}
          <ViewLinksSection records={records} />

          {isOwner && !expiry.isInGrace && (
            <div className="space-y-2">
              {profileEditNewEnabled ? (
                <EditProfileDialog
                  name={name}
                  onUpdated={refetchRecords}
                  owner={owner}
                  records={records}
                />
              ) : (
                <LinkButton
                  className="w-full"
                  params={{ name }}
                  to="/p/$name/edit"
                >
                  <Trans>Edit Profile</Trans>
                </LinkButton>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
