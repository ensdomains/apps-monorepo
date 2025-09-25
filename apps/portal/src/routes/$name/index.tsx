import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { Button } from '@/components/ui/button'
import { ExpiryWithRegistrationData } from '@/features/profile/components/ExpiryWithRegistrationData'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { PrimaryNameLabel } from '@/features/profile/components/PrimaryNameLabel'
import { RecordCount } from '@/features/profile/components/RecordCount'
import { ResolverLocation } from '@/features/profile/components/ResolverLocation'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
export const Route = createFileRoute('/$name/')({
  component: App,
})

const Owner = ({ name }: { name: string }) => {
  const {
    data: owner,
    error,
    isLoading,
  } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (error) return <div>Error: {error.message}</div>
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

  return (
    <div className="flex flex-col gap-4 p-4 max-w-5xl mx-auto">
      <div className="flex flex-row justify-between items-baseline">
        <h1 className="text-[28px] font-medium leading-[1]">Overview</h1>
        <Button variant="secondary">Extend</Button>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-6 gap-4">
        <div className="xl:col-span-4 flex flex-col sm:flex-row p-6 items-center gap-6 rounded-lg border border-gray-300">
          <NameAvatar name={name} />
          <div className="flex flex-col gap-1 items-center sm:items-start">
            <PrimaryNameLabel name={name} />
            <h2 className="text-[40px] font-medium w-max">{name}</h2>
            <Owner name={name} />
          </div>
        </div>
        <ExpiryWithRegistrationData name={name} />
        <ResolverLocation name={name} />
        <ResolverLocation name={name} />
        <RecordCount name={name} />
      </div>
    </div>
  )
}
