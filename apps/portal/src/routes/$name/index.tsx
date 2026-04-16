import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useEnsResolver } from 'wagmi'
import { AvailableNameMessage } from '@/components/AvailableNameMessage'
import { ErrorMessage } from '@/components/ErrorMessage'
import { InvalidNameMessage } from '@/components/InvalidNameMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { ExpiryWithRegistrationData } from '@/features/profile/components/ExpiryWithRegistrationData'
import { NameProfileCard } from '@/features/profile/components/NameProfileCard'
import { Owner } from '@/features/profile/components/Owner'
import { ParentName } from '@/features/profile/components/ParentName'
import { ProtocolVersionWithCounter } from '@/features/profile/components/ProtocolVersionWithCounter'
import { RecentActivity } from '@/features/profile/components/RecentActivity'
import { RecordCount } from '@/features/profile/components/RecordCount'
import { RegistryCard } from '@/features/profile/components/RegistryCard'
import { ResolverCard } from '@/features/profile/components/ResolverCard'
import { SubnameCount } from '@/features/profile/components/SubnameCount'
import { getDnsSecEnabledQueryOptions } from '@/features/profile/hooks/useDnsSecEnabled'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { universalResolverAddress } from '@/lib/constants/universalResolver'
import {
  getTLD,
  is2LD,
  isClaimable,
  isRegistrable,
  isTLD,
} from '@/utils/ens/tldHelpers'
import { queryClient } from '@/utils/queryClient'
import { isValidEnsName } from '@/utils/token/isNormalized'

export const Route = createFileRoute('/$name/')({
  component: App,
  notFoundComponent: () => <NotFoundMessage />,
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

  // Check availability for 2LDs when:
  // - TLD is valid (either .eth or DNSSEC-enabled)
  // - It's a 2LD (not a TLD or 3LD+)
  // For .eth 2LDs, fire in parallel with owner query to avoid waterfall.
  // For non-.eth, we still need to wait for DNSSEC check.
  // The result is only used when ownerQuery returns null.
  const shouldCheckAvailability = isTldValid && is2LD(name)

  const availabilityQuery = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: shouldCheckAvailability,
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

    // Case 3: It's a 2LD - check availability
    if (availabilityQuery.isLoading) {
      return <LoadingSpinner title="Checking availability..." />
    }

    // Name is available
    if (availabilityQuery.data?.isAvailable) {
      // .eth names can be registered
      if (isRegistrable(name)) {
        return <AvailableNameMessage name={name} />
      }
      // Other valid TLD names - DNS import not available on ENSv2 yet
      if (isClaimable(name)) {
        return (
          <NotFoundMessage
            title="DNS import not available"
            description={
              <>
                <strong>{name}</strong> could be claimed via DNS import, but
                this feature isn't available yet on ENSv2.
              </>
            }
          />
        )
      }
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
      const errorMessage =
        (availabilityQuery.error.cause as Error | undefined)?.message ??
        'Failed to check name availability'
      return (
        <ErrorMessage
          title="Error checking availability"
          description={errorMessage}
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

  // Profile query error - but we have owner, so name exists
  if (profileQuery.error) {
    // Don't show error for profile fetch failures on existing names
    // The name exists (we have owner), just profile data failed
    console.warn('Profile fetch failed:', profileQuery.error.cause?.message)
  }

  const resolvedProtocolVersion = ownerQuery.data.protocolVersion || 'ENSv1'

  return (
    <div className="flex flex-col gap-12 p-10 w-full max-w-360 mx-auto">
      {/* Header */}
      <div className="flex flex-row justify-between items-center">
        <h1 className="text-4xl font-medium leading-none">{name}</h1>
      </div>

      {/* Main section: profile | metadata rows | counters */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_2fr] gap-3">
        {/* Left: avatar + bio + socials */}
        <NameProfileCard name={name} stacked />

        {/* Middle: metadata rows */}
        <div className="flex flex-col flex-1">
          <ExpiryWithRegistrationData
            name={name}
            protocolVersion={resolvedProtocolVersion}
          />
          <Owner owner={ownerQuery.data.owner} asRow />
          <ParentName name={name} asRow />
          {resolverAddress && (
            <ResolverCard name={name} resolverAddress={resolverAddress} asRow />
          )}
          <RegistryCard
            name={name}
            registryAddress={ownerQuery.data.registryAddress}
            asRow
          />
        </div>

        {/* Right: counter cards */}
        <div className="flex flex-col gap-3 shrink-0">
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

      {/* History */}
      {resolvedProtocolVersion === 'ENSv1' && <RecentActivity name={name} />}
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
