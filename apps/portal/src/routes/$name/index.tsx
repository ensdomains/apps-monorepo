import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useEnsResolver } from 'wagmi'
import { AvailableNameMessage } from '@/components/AvailableNameMessage'
import { ErrorMessage } from '@/components/ErrorMessage'
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
import { SubnameCount } from '@/features/profile/components/SubnameCount'
import { TokenLocation } from '@/features/profile/components/TokenLocation'
import { getDnsSecEnabledQueryOptions } from '@/features/profile/hooks/useDnsSecEnabled'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import {
  getTLD,
  is2LD,
  isClaimable,
  isRegistrable,
  isTLD,
} from '@/utils/ens/tldHelpers'
import { isValidEnsName } from '@/utils/token/isNormalized'

export const Route = createFileRoute('/$name/')({
  component: App,
  notFoundComponent: () => <NotFoundMessage />,
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

  const [profileQuery, ownerQuery] = useQueries({
    queries: [getProfileQueryOptions(name), getEnsOwnerQueryOptions({ name })],
  })

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
    return (
      <NotFoundMessage
        title="Invalid TLD"
        description={
          <>
            <strong>.{tld}</strong> is not a valid ENS TLD. Only TLDs with
            DNSSEC enabled are supported.
          </>
        }
      />
    )
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

  const network = ownerQuery.data.network || 'sepolia'

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="lg:col-span-2 xl:col-span-2">
          <NameProfileCard name={name} />
        </div>
        <ExpiryWithRegistrationData name={name} network={network} />
        <Owner owner={ownerQuery.data.owner} />
        <ParentName name={name} />
        <TokenLocation name={name} network={network} />
        {resolverAddress && (
          <RecordCount
            name={name}
            records={profileQuery.data?.records}
            resolverAddress={resolverAddress}
          />
        )}
        <SubnameCount
          name={name}
          registryAddress={ownerQuery.data.registryAddress}
          network={network}
        />
        <ProtocolVersionWithCounter name={name} network={network} />
      </div>
      {network === 'sepolia' && <RecentActivity name={name} />}
    </>
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
    universalResolverAddress: '0x50168842c0f5c9992a34085d9a6dc5b0a4f306ce',
    query: {
      // Don't fetch resolver for invalid names
      enabled: isValidName,
    },
  })

  // Show 404 for invalid/malformed names
  if (!isValidName) {
    return (
      <NotFoundMessage
        title="Invalid name"
        description={
          <>
            <strong>{name}</strong> is not a valid ENS name.
            <br />
            Names must be normalized (lowercase, valid characters).
          </>
        }
      />
    )
  }

  if (error) {
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

  return (
    <div className="flex flex-col gap-6 p-6 w-full max-w-360 mx-auto">
      <div className="flex flex-row justify-between items-baseline">
        <h1 className="text-[28px] font-medium leading-none">Overview</h1>
      </div>
      <Profile name={name} resolverAddress={resolverAddress} />
    </div>
  )
}
