import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useEnsResolver } from 'wagmi'
import { Owner } from '@/components/primary-name/Owner'
import { ExpiryWithRegistrationData } from '@/features/profile/components/ExpiryWithRegistrationData'
import { NameProfileCard } from '@/features/profile/components/NameProfileCard'
import { RecentActivity } from '@/features/profile/components/RecentActivity'
import { RecordCount } from '@/features/profile/components/RecordCount'
import { ResolverLocation } from '@/features/profile/components/ResolverLocation'
import { RolesCount } from '@/features/profile/components/RolesCount'
import { SubnameCount } from '@/features/profile/components/SubnameCount'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'

export const Route = createFileRoute('/$name/')({
  component: App,
})

const Profile = ({
  name,
  resolverAddress,
}: {
  name: string
  resolverAddress: Address
}) => {
  const { data, isLoading, error } = useQuery(getProfileQueryOptions(name))

  if (error) return <div>Error: {error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      <div className="lg:col-span-2 xl:col-span-2">
        <NameProfileCard name={name} />
      </div>
      <ExpiryWithRegistrationData name={name} />
      <RolesCount name={name} />
      <RolesCount name={name} />
      <ResolverLocation name={name} resolverAddress={resolverAddress} />

      <RecordCount name={name} records={data?.records} />
      <SubnameCount name={name} />
      <RolesCount name={name} />
    </div>
  )
}

function App() {
  const { name } = useParams({ from: '/$name/' })

  const {
    data: tempResolverAddress,
    isLoading,
    error,
  } = useEnsResolver({
    name,
  })

  const resolverAddress =
    tempResolverAddress === '0xb5c0FF6c84d352e896d1026193809b8FF248dCdF'
      ? '0x352d7aA7a8bd0F6f31635BE5ceCb6Cebb6929A15'
      : tempResolverAddress

  if (error) {
    if (error.name === 'ChainDoesNotSupportContract')
      return <div>Chain does not have UniversalResolver</div>
    return <div>{error.message}</div>
  }

  if (isLoading) return <div>Loading...</div>

  if (!resolverAddress) return <div>Resolver not found</div>

  return (
    <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <div className="flex flex-row justify-between items-baseline">
        <h1 className="text-[28px] font-medium leading-[1]">Overview</h1>
      </div>
      <Profile name={name} resolverAddress={resolverAddress} />
      <RecentActivity name={name} />
    </div>
  )
}
