import { useQueries } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useEnsResolver } from 'wagmi'
import { ErrorMessage } from '@/components/molecules/ErrorMessage'
import { LoadingMessage } from '@/components/molecules/LoadingMessage'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { NotFoundMessage } from '@/components/molecules/NotFoundMessage'
import { Owner } from '@/components/primary-name/Owner'
import { ExpiryWithRegistrationData } from '@/features/profile/components/ExpiryWithRegistrationData'
import { NameProfileCard } from '@/features/profile/components/NameProfileCard'
import { ParentName } from '@/features/profile/components/ParentName'
import { ProtocolVersionWithCounter } from '@/features/profile/components/ProtocolVersionWithCounter'
import { RecentActivity } from '@/features/profile/components/RecentActivity'
import { RecordCount } from '@/features/profile/components/RecordCount'
import { SubnameCount } from '@/features/profile/components/SubnameCount'
import { TokenLocation } from '@/features/profile/components/TokenLocation'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'

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
  const [profileQuery, ownerQuery] = useQueries({
    queries: [getProfileQueryOptions(name), getEnsOwnerQueryOptions({ name })],
  })

  if (profileQuery.error)
    return (
      <div>
        Failed to fetch the profile: {profileQuery.error.cause?.message}
      </div>
    )
  if (ownerQuery.error)
    return (
      <div>Failed to fetch the owner: {ownerQuery.error.cause?.message}</div>
    )
  if (ownerQuery.isLoading || profileQuery.isLoading)
    return <LoadingSpinner title="Loading..." />

  const network = ownerQuery.data?.network || 'sepolia'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      <div className="lg:col-span-2 xl:col-span-2">
        <NameProfileCard name={name} />
      </div>
      <ExpiryWithRegistrationData name={name} network={network} />
      <Owner owner={ownerQuery.data?.owner} />
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
        registryAddress={ownerQuery.data?.registryAddress}
      />
      <ProtocolVersionWithCounter name={name} network={network} />
    </div>
  )
}

function App() {
  const { name } = useParams({ from: '/$name/' })

  const {
    data: resolverAddress,
    isLoading,
    error,
  } = useEnsResolver({
    name,
    universalResolverAddress: '0x50168842c0f5c9992a34085d9a6dc5b0a4f306ce',
  })

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
      <RecentActivity name={name} />
    </div>
  )
}
