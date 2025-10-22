import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useEnsResolver } from 'wagmi'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { Button } from '@/components/ui/button'
import { ExpiryWithRegistrationData } from '@/features/profile/components/ExpiryWithRegistrationData'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { PrimaryNameLabel } from '@/features/profile/components/PrimaryNameLabel'
import { RecentActivity } from '@/features/profile/components/RecentActivity'
import { RecordCount } from '@/features/profile/components/RecordCount'
import { ResolverLocation } from '@/features/profile/components/ResolverLocation'
import { RolesCount } from '@/features/profile/components/RolesCount'
import { SubnameCount } from '@/features/profile/components/SubnameCount'
import { TokenLocation } from '@/features/profile/components/TokenLocation'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { wagmiConfig } from '@/lib/wagmi'

export const Route = createFileRoute('/$name/')({
  component: App,
})

const Owner = ({ name }: { name: string }) => {
  const {
    data: owner,
    error,
    isLoading,
  } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (error) return <div>Error: {error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>
  if (!owner) return null

  return (
    <span className="flex flex-row gap-1 items-baseline">
      <span>Owned by</span>
      <CopyableRecord
        className="max-w-40 sm:max-w-54 xl:max-w-80"
        value={owner.owner}
      />
    </span>
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
    universalResolverAddress:
      wagmiConfig.chains[0].contracts.ensUniversalResolver.address,
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
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="lg:col-span-2 xl:col-span-2 flex flex-col sm:flex-row p-6 items-center gap-6 rounded-lg border border-gray-300">
          <NameAvatar name={name} />
          <div className="flex flex-col gap-1 items-center sm:items-start">
            <PrimaryNameLabel name={name} />
            <h2 className="text-[40px] font-medium w-max">{name}</h2>
            <Owner name={name} />
          </div>
        </div>
        <ExpiryWithRegistrationData name={name} />
        <ResolverLocation name={name} resolverAddress={resolverAddress} />
        <RecordCount name={name} />
        <SubnameCount name={name} />
        <RolesCount name={name} />
      </div>
      <RecentActivity name={name} />
    </div>
  )
}
