import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useAccount, useEnsAddress, useEnsAvatar } from 'wagmi'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { Button } from '@/components/ui/button'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
export const Route = createFileRoute('/$name/')({
  component: App,
})

const Avatar = ({ name }: { name: string }) => {
  const { data: avatar, error, isLoading } = useEnsAvatar({ name })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (avatar)
    return (
      <img
        src={avatar}
        alt="avatar"
        className="w-[138px] h-[138px] rounded-lg"
      />
    )
  return null
}

const PrimaryAddress = ({ name }: { name: string }) => {
  const { address } = useAccount()

  const { data: reverseAddress, error, isLoading } = useEnsAddress({ name })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (address === reverseAddress)
    return (
      <div className="bg-gray-200 px-3 py-1 rounded-4xl">Your primary name</div>
    )
  return null
}

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
      <CopyableRecord className="max-w-40" value={owner.owner} />
    </span>
  )
}

function App() {
  const { name } = useParams({ from: '/$name/' })

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-row justify-between items-baseline">
        <h1 className="text-[28px] font-medium leading-[1]">Overview</h1>
        <Button variant="secondary">Extend</Button>
      </div>
      <div className="flex flex-col sm:flex-row p-6 items-center gap-6 rounded-lg border border-gray-300">
        <Avatar name={name} />
        <div className="flex flex-col gap-1 items-center sm:items-start">
          <PrimaryAddress name={name} />
          <h2 className="text-[40px] font-medium w-max">{name}</h2>
          <Owner name={name} />
        </div>
      </div>
    </div>
  )
}
