import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useConnection, useEnsResolver } from 'wagmi'
import { AvailableNameMessage } from '@/components/AvailableNameMessage'
import { ErrorMessage } from '@/components/ErrorMessage'
import { InvalidNameMessage } from '@/components/InvalidNameMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { nameHeadingClassName, PageHeading } from '@/components/PageHeading'
import { DnsClaimableMessage } from '@/features/dns-import/components/DnsClaimableMessage'
import { DnsOutOfSyncBanner } from '@/features/dns-import/components/DnsOutOfSyncBanner'
import { SyncManagerBanner } from '@/features/dns-import/components/SyncManagerBanner'
import { useDnsSyncStatus } from '@/features/dns-import/hooks/useDnsSyncStatus'
import { RecentHistoryTimeline } from '@/features/history/components/RecentHistoryTimeline'
import { UpgradeBanner } from '@/features/migration/components/UpgradeBanner'
import {
  getMigrationStatusQueryOptions,
  useMigrationStatus,
} from '@/features/migration/hooks/useMigrationStatus'
import { DnsManagerRow } from '@/features/ownership/components/DnsManagerRow'
import { NameOwnerRow } from '@/features/ownership/components/NameOwnerRow'
import { ExpiryWithRegistrationData } from '@/features/profile/components/ExpiryWithRegistrationData'
import { GraceBanner } from '@/features/profile/components/GraceBanner'
import { NameProfileCard } from '@/features/profile/components/NameProfileCard'
import { ParentName } from '@/features/profile/components/ParentName'
import { ProtocolRow } from '@/features/profile/components/ProtocolRow'
import { ProtocolVersionWithCounter } from '@/features/profile/components/ProtocolVersionWithCounter'
import { RecordCount } from '@/features/profile/components/RecordCount'
import { RegistryCard } from '@/features/profile/components/RegistryCard'
import { ResolverCard } from '@/features/profile/components/ResolverCard'
import { SubnameCount } from '@/features/profile/components/SubnameCount'
import { getDnsSecEnabledQueryOptions } from '@/features/profile/hooks/useDnsSecEnabled'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { useGraceStatus } from '@/features/profile/hooks/useGraceStatus'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { RegistrationSuccessBanner } from '@/features/register/components/RegistrationSuccessBanner'
import { ExtendNameButton } from '@/features/renew/components/ExtendNameButton'
import { useCanExtend } from '@/features/renew/hooks/useCanExtend'
import { universalResolverAddress } from '@/lib/constants/universalResolver'
import {
  getTLD,
  is2LD,
  isClaimable,
  isRegistrable,
  isTLD,
} from '@/utils/ens/tldHelpers'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { queryClient } from '@/utils/queryClient'
import { isValidEnsName } from '@/utils/token/isNormalized'
import { validateNameLength } from '@/utils/token/nameValidation'

type NameSearch = {
  readonly registered?: boolean
  readonly duration?: number
  readonly paid?: string
}

const validateNameSearch = (search: Record<string, unknown>): NameSearch => {
  if (search.registered !== true && search.registered !== 'true') return {}
  const duration = Number(search.duration)
  return {
    registered: true,
    duration: Number.isFinite(duration) ? duration : undefined,
    paid: typeof search.paid === 'string' ? search.paid : undefined,
  }
}

export const Route = createFileRoute('/$name/')({
  component: App,
  notFoundComponent: () => <NotFoundMessage />,
  validateSearch: validateNameSearch,
  loader: ({ params }) => {
    const tld = getTLD(params.name)
    return Promise.all([
      queryClient.prefetchQuery(getProfileQueryOptions({ name: params.name })),
      ...(tld !== 'eth'
        ? [queryClient.prefetchQuery(getDnsSecEnabledQueryOptions({ tld }))]
        : []),
    ])
  },
})

const Profile = ({
  name,
  resolverAddress,
}: {
  name: string
  resolverAddress?: Address
}) => {
  const { registered, duration, paid } = Route.useSearch()
  const registrationBanner =
    registered === true && duration !== undefined && paid !== undefined
      ? { durationSeconds: duration, paid }
      : null
  const tld = getTLD(name)
  const isEthTld = tld === 'eth'

  const ownerQuery = useQuery(getEnsOwnerQueryOptions({ name }))
  const profileQuery = useQuery(
    getProfileQueryOptions({
      name,
      protocolVersion: ownerQuery.data?.protocolVersion,
    }),
  )

  // Check DNSSEC for non-.eth TLDs to verify they're valid
  const dnsSecQuery = useQuery(
    getDnsSecEnabledQueryOptions({
      tld,
      // Only check for non-eth TLDs when we need to validate
      enabled: !isEthTld,
    }),
  )

  // For non-.eth TLDs, we need to wait for DNSSEC check
  const isTldValid = isEthTld || dnsSecQuery.data === true

  // `getAvailable` only supports .eth 2LDs (it re-appends `.eth`, so a non-.eth
  // 2LD like `alice.xyz` would query an unrelated `alice.xyz.eth` and throw).
  // Gate on isRegistrable so `enabled` matches the guards that consume it; fires
  // in parallel with the owner query to avoid a waterfall.
  const availabilityQuery = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: isRegistrable(name),
  })

  // When ownerQuery returns null, the registry has gated ownerOf on _isExpired,
  // so we can't tell from the chain alone whether the name is genuinely
  // unregistered or sitting in its 28-day v2 grace window. Default the hook to
  // 'ENSv2' in that case so it consults the indexer to detect grace state.
  // (v1 names in grace still return an owner from the registrar, so a null
  // owner implies the name isn't a v1-in-grace case.)
  //
  // DNS names are excluded entirely: they're V1-only, and a DNS import carries
  // no registrar expiry, so neither grace path applies. `undefined` keeps both
  // queries disabled rather than asking the v2 indexer about a name that
  // cannot exist in v2, or the .eth registrar about a name it doesn't hold.
  const grace = useGraceStatus({
    name,
    protocolVersion: isEthTld
      ? (ownerQuery.data?.protocolVersion ?? 'ENSv2')
      : undefined,
  })

  const { address: connectedAddress } = useConnection()

  // Sync state between an imported DNS name's `_ens` TXT record and its v1
  // manager. Internally gated to onchain-imported DNS 2LDs.
  const dnsSync = useDnsSyncStatus({
    name,
    manager: ownerQuery.data?.owner,
    protocolVersion: ownerQuery.data?.protocolVersion,
    connectedAddress,
  })

  const migrationQuery = useMigrationStatus(name, {
    enabled: ownerQuery.data?.protocolVersion === 'ENSv1',
  })
  // The Protocol row states a fact about the name, so it is evaluated against
  // the name's own v1 token holder rather than the connected wallet: a visitor
  // still sees whether the name can be migrated.
  const nameMigrationQuery = useQuery({
    ...getMigrationStatusQueryOptions({ name }),
    enabled: ownerQuery.data?.protocolVersion === 'ENSv1',
  })

  const { canExtend: graceCanExtend, isLoading: graceCanExtendLoading } =
    useCanExtend({
      name,
      protocolVersion: ownerQuery.data?.protocolVersion ?? 'ENSv2',
      enabled: grace.isInGrace,
    })

  // Loading states
  if (ownerQuery.isLoading) {
    return <LoadingSpinner title="Loading owner..." />
  }
  if (profileQuery.isLoading) {
    return <LoadingSpinner title="Loading profile..." />
  }

  // Wait for DNSSEC check for non-.eth TLDs
  if (!isEthTld && dnsSecQuery.isLoading) {
    return <LoadingSpinner title="Validating TLD..." />
  }

  // A failed DNSSEC lookup is an error, not a verdict on the TLD — only a
  // completed check that returns false may declare the TLD invalid.
  if (!isEthTld && dnsSecQuery.isError) {
    return (
      <ErrorMessage
        title="Could not validate TLD"
        description={
          dnsSecQuery.error.message ||
          `Checking DNSSEC for .${tld} failed. Try refreshing the page.`
        }
      />
    )
  }

  // IMPORTANT: Check TLD validity FIRST, before showing any profile data
  // Even if owner data exists, we shouldn't show profiles for invalid TLDs
  if (!isTldValid) {
    return <InvalidNameMessage title="Invalid TLD" />
  }

  // If owner is null (not found), handle different cases
  if (!ownerQuery.data) {
    // Case 1: It's a TLD that doesn't exist (but is valid)
    if (isTLD(name)) {
      return (
        <NotFoundMessage
          title="TLD not found"
          description={
            <>
              The TLD <strong>{name}</strong> does not have any data in ENS yet.
            </>
          }
        />
      )
    }

    // Case 2: It's a 3LD+ that doesn't exist
    if (!is2LD(name)) {
      return (
        <NotFoundMessage
          title="Name not found"
          description={
            <>
              <strong>{name}</strong> does not exist.
            </>
          }
        />
      )
    }

    // Case 3: A DNS 2LD with no registry entry — offer the import flow, or
    // the custom-TLD notice when the TLD operator runs its own integration.
    // (The availability query below is .eth-only, so this must come first.)
    if (isClaimable(name)) {
      return <DnsClaimableMessage name={name} />
    }

    // Case 4: It's a .eth 2LD - check availability
    if (availabilityQuery.isLoading) {
      return <LoadingSpinner title="Checking availability..." />
    }

    // Name is available
    if (availabilityQuery.data?.isAvailable) {
      // .eth names can be registered
      if (isRegistrable(name)) {
        const lengthError = validateNameLength(name)
        return lengthError ? (
          <InvalidNameMessage
            title="Name too short"
            description={lengthError}
          />
        ) : (
          <AvailableNameMessage name={name} />
        )
      }
    }

    // Wait for indexer before deciding between v2 grace and error states
    if (grace.isLoading) {
      return <LoadingSpinner title="Loading..." />
    }

    // Without indexer data we can't distinguish grace from genuinely missing,
    // so surface the failure rather than falling through to "Name not found".
    if (grace.error) {
      const errorMessage =
        (grace.error as { cause?: { message?: string } }).cause?.message ??
        'Failed to load registration data'
      return (
        <ErrorMessage title="Error loading name" description={errorMessage} />
      )
    }

    // V2 grace: registrar's _checkGrace still blocks re-registration, but the
    // registry's ownerOf returned zero. Render banner + Extend so the previous
    // owner can renew before the window closes.
    if (grace.isInGrace && grace.graceEndDate) {
      return (
        <div className="flex flex-col gap-8">
          <GraceBanner
            graceEndDate={grace.graceEndDate}
            canExtend={graceCanExtend}
          />
          <div className="flex flex-row justify-between items-center">
            <PageHeading className={nameHeadingClassName}>{name}</PageHeading>
            <ExtendNameButton name={name} protocolVersion="ENSv2" />
          </div>
        </div>
      )
    }

    // Handle errors
    if (ownerQuery.error) {
      return (
        <ErrorMessage
          title="Error loading name"
          description={ownerQuery.error.cause?.message}
        />
      )
    }

    if (availabilityQuery.error) {
      return (
        <ErrorMessage
          title="Error checking availability"
          description={
            availabilityQuery.error.cause?.message ||
            availabilityQuery.error.message
          }
        />
      )
    }

    // Name is not available but we couldn't get owner info
    return (
      <ErrorMessage
        title="Name not found"
        description="Could not retrieve information for this name."
      />
    )
  }

  if (availabilityQuery.isLoading && isRegistrable(name)) {
    return <LoadingSpinner title="Checking availability..." />
  }

  if (availabilityQuery.error && isRegistrable(name)) {
    return (
      <ErrorMessage
        title="Error checking availability"
        description={
          availabilityQuery.error.cause?.message ||
          availabilityQuery.error.message
        }
      />
    )
  }

  if (availabilityQuery.data?.isAvailable && isRegistrable(name)) {
    const lengthError = validateNameLength(name)
    return lengthError ? (
      <InvalidNameMessage title="Name too short" description={lengthError} />
    ) : (
      <AvailableNameMessage name={name} />
    )
  }

  // Profile query error - but we have owner, so name exists
  if (profileQuery.error) {
    // Don't show error for profile fetch failures on existing names
    // The name exists (we have owner), just profile data failed
    console.warn(
      'Profile fetch failed:',
      extractErrorMessage(profileQuery.error, ''),
    )
  }

  // Match the grace/canExtend default above: a missing protocolVersion means the
  // owner query hasn't resolved, and 'ENSv2' is the safe conservative choice.
  const resolvedProtocolVersion = ownerQuery.data.protocolVersion ?? 'ENSv2'

  const migration = migrationQuery.data
  const { isMigratableByConnectedOwner } = migrationQuery

  // Suppress the upgrade prompt whenever the name is expired (grace period or
  // fully expired past grace) — the user must extend/renew first. The upgrade
  // banner reappears once the name is active again.
  const showUpgradeBanner =
    resolvedProtocolVersion === 'ENSv1' &&
    isMigratableByConnectedOwner &&
    !grace.isExpired

  return (
    <div className="flex flex-col gap-8">
      {registrationBanner && (
        <RegistrationSuccessBanner name={name} {...registrationBanner} />
      )}

      {grace.isInGrace && grace.graceEndDate && (
        <GraceBanner
          graceEndDate={grace.graceEndDate}
          canExtend={graceCanExtend || graceCanExtendLoading}
        />
      )}

      {showUpgradeBanner && (
        <UpgradeBanner
          name={name}
          wrapped={migration?.migratable && migration.tokenType === 'unlocked'}
        />
      )}

      {dnsSync.status === 'syncable' && <SyncManagerBanner name={name} />}

      {dnsSync.status === 'out-of-sync' && (
        <DnsOutOfSyncBanner
          name={name}
          onRefresh={dnsSync.refresh}
          isRefreshing={dnsSync.isRefreshing}
        />
      )}

      {/* Header */}
      <div className="flex flex-row justify-between items-center">
        <PageHeading className={nameHeadingClassName}>{name}</PageHeading>
        {resolvedProtocolVersion !== 'ENSv1' && (
          <ExtendNameButton
            name={name}
            protocolVersion={resolvedProtocolVersion}
          />
        )}
      </div>

      {/* Profile | metadata | counters at xl; counters wrap to their own row below that */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(min-content,1fr)] xl:grid-cols-[240px_auto_300px] xl:justify-between gap-3">
        {/* Left: avatar + bio + socials */}
        <NameProfileCard name={name} stacked />

        {/* Middle: metadata rows */}
        <div className="flex flex-col flex-1">
          <ExpiryWithRegistrationData
            name={name}
            protocolVersion={resolvedProtocolVersion}
          />
          <NameOwnerRow
            name={name}
            owner={ownerQuery.data.owner}
            protocolVersion={resolvedProtocolVersion}
            label={grace.isInGrace ? 'Previous owner' : 'Owner'}
          />
          <DnsManagerRow
            name={name}
            manager={ownerQuery.data.owner}
            protocolVersion={resolvedProtocolVersion}
          />
          <ParentName name={name} asRow />
          {resolverAddress && (
            <ResolverCard name={name} resolverAddress={resolverAddress} asRow />
          )}
          <RegistryCard
            name={name}
            registryAddress={ownerQuery.data.registryAddress}
            asRow
            protocolVersion={resolvedProtocolVersion}
          />
          <ProtocolRow
            protocolVersion={resolvedProtocolVersion}
            migration={nameMigrationQuery.data}
            isLoading={nameMigrationQuery.isLoading}
          />
        </div>

        {/* Counter cards */}
        <div className="grid grid-cols-1 gap-3 content-start sm:grid-cols-3 lg:col-span-2 xl:col-span-1 xl:grid-cols-1">
          <SubnameCount name={name} protocolVersion={resolvedProtocolVersion} />
          <ProtocolVersionWithCounter
            name={name}
            protocolVersion={resolvedProtocolVersion}
          />
          {resolverAddress && (
            <RecordCount
              name={name}
              records={profileQuery.data?.records}
              resolverAddress={resolverAddress}
            />
          )}
        </div>
      </div>

      <RecentHistoryTimeline name={name} />
    </div>
  )
}

function App() {
  const { name } = useParams({ from: '/$name/' })

  // Validate name format - must be a valid ENS name (normalized + ends with .eth)
  const isValidName = isValidEnsName(name)

  const {
    data: resolverAddress,
    isLoading,
    error,
  } = useEnsResolver({
    name,
    universalResolverAddress,
    query: {
      // Don't fetch resolver for invalid names
      enabled: isValidName,
    },
  })

  // Show 404 for invalid/malformed names
  if (!isValidName) {
    return <InvalidNameMessage title="Invalid name" />
  }

  if (error) {
    if (!is2LD(name) && !isTLD(name)) {
      return (
        <NotFoundMessage
          title="Name not found"
          description={
            <>
              <strong>{name}</strong> does not exist.
            </>
          }
        />
      )
    }

    const message =
      (error?.cause as Error | undefined)?.message ||
      (error as Error | undefined)?.message ||
      'Could not load data.'

    if (error.name === 'ChainDoesNotSupportContract')
      return (
        <ErrorMessage
          title="Error loading data"
          description="Chain does not have UniversalResolver"
        />
      )
    return <ErrorMessage title="Error loading data" description={message} />
  }

  if (isLoading) return <LoadingMessage />

  return <Profile name={name} resolverAddress={resolverAddress} />
}
