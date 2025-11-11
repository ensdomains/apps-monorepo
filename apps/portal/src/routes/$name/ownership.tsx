import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import type { Address } from 'viem/accounts'
import { useEnsName } from 'wagmi'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { NameHistory } from '@/components/organisms/NameHistory/NameHistory'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { parentName } from '@/lib/parent'

export const Route = createFileRoute('/$name/ownership')({
  component: RouteComponent,
})

interface OwnerDisplayProps {
  owner: Address
}

const OwnerDisplay = ({ owner }: OwnerDisplayProps) => {
  const { data: ensName, isLoading } = useEnsName({
    address: owner,
  })

  if (isLoading) return <div>Loading...</div>

  if (ensName) {
    return (
      <>
        <CopyableRecord value={ensName} />
        <CopyableRecord value={owner} />
      </>
    )
  } else {
    return <CopyableRecord value={owner} />
  }
}

interface OwnerInfoProps {
  name: string
}

const OwnerInfo = ({ name }: OwnerInfoProps) => {
  const { data, isLoading, error } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (isLoading) return <div>Loading...</div>
  if (error || !data) {
    if (error) return <div>Error: {(error.cause as Error).message}</div>
    return <div>Could not load owner</div>
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="p-6 rounded-lg gap-4 flex flex-col border border-secondary w-full">
        <h2 className="text-2xl font-medium">Current Owner</h2>
        <div>
          <OwnerDisplay owner={data.owner} />
        </div>
      </div>
      <div className="border border-secondary p-6 rounded-lg">WIP</div>
    </div>
  )
}

interface ParentInfoProps {
  name: string
}

const ParentInfo = ({ name }: ParentInfoProps) => {
  const parent = parentName(name)

  return (
    <div className="p-6 rounded-lg gap-4 flex flex-col border border-secondary w-full">
      <h2 className="text-2xl font-medium">Parent name</h2>
      <div>
        <CopyableRecord value={parent} />
      </div>
    </div>
  )
}

function RouteComponent() {
  const { name } = useParams({ from: '/$name/ownership' })
  return (
    <div className="max-w-5xl w-full mx-auto flex flex-col gap-6 m-6 px-4">
      <div className="flex flex-row justify-between">
        <h1 className="font-medium text-[28px]">Ownership</h1>
        <a
          href="#change"
          className="bg-secondary text-secondary-foreground px-4 py-2 rounded-sm text-base font-medium"
        >
          Transfer ownership
        </a>
      </div>
      <div className="flex flex-col gap-6">
        <OwnerInfo name={name} />
        <NameHistory name={name} eventType="domainEvents" />
        <ParentInfo name={name} />
      </div>
    </div>
  )
}
