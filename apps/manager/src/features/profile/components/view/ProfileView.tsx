import { Trans } from '@lingui/react/macro'
import { useWallet } from '@getpara/react-sdk-lite'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import { LinkButton } from '@/components/ui/button'
import { GracePeriodBanner } from '@/features/grace/components/GracePeriodBanner'
import { ProfileLoading } from '@/features/profile/components/common/ProfileLoading'
import { UpgradeBanner } from '@/features/migration/components/UpgradeBanner'
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

const useOwnerRedirect = (
  name: string,
  isProfileEmpty: boolean,
  isInGrace: boolean,
) => {
  const navigate = useNavigate()
  const { data: ownerData, isPending: isOwnerPending } = useQuery({
    ...profileOwnerQuery(name),
  })

  const { data: wallet } = useWallet()
  const { accountAddress: smartAccountAddress } = useSmartAccountContext()

  const normalizedOwner = ownerData?.owner?.toLowerCase()
  const isOwner =
    !!normalizedOwner &&
    [wallet?.address, smartAccountAddress]
      .filter((addr): addr is string => !!addr)
      .some((addr) => addr.toLowerCase() === normalizedOwner)

  const shouldRedirectToEdit = isOwner && isProfileEmpty && !isInGrace

  useEffect(() => {
    if (shouldRedirectToEdit) {
      navigate({ to: '/p/$name/edit', params: { name }, replace: true })
    }
  }, [shouldRedirectToEdit, navigate, name])

  return {
    isOwner,
    owner: ownerData?.owner as Address | undefined,
    shouldHide: (isOwner || isOwnerPending) && isProfileEmpty && !isInGrace,
  }
}

export const ProfileView = ({ name }: ProfileViewProps) => {
  const migrationEnabled = useFeatureFlag('MIGRATION')
  const { data: profileRecords } = useSuspenseQuery({
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

  const { isOwner, owner, shouldHide } = useOwnerRedirect(
    name,
    isProfileEmpty,
    expiry.isInGrace,
  )

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
      style={match(expiry.isInGrace)
        .with(true, () => undefined)
        .with(false, () => themeVars)
        .exhaustive()}
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
            <div>
              <LinkButton
                className="w-full"
                params={{ name }}
                to="/p/$name/edit"
              >
                <Trans>Edit Profile</Trans>
              </LinkButton>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
