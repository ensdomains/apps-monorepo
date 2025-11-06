import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useAccount, useDisconnect, useEnsName } from 'wagmi'
import { Owner } from '@/components/primary-name/Owner'
import { Button } from '@/components/ui/button'
import { NameCount } from '@/features/dashboard/components/NameCount'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { PrimaryNameLabel } from '@/features/profile/components/PrimaryNameLabel'

export const Route = createFileRoute('/addr/$addr/')({
  component: RouteComponent,
})

const PrimaryName = ({ addr }: { addr: Address }) => {
  const {
    data: name,
    isLoading,
    error,
  } = useEnsName({
    address: addr as Address,
  })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (name)
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="lg:col-span-2 flex flex-col sm:flex-row p-6 items-center gap-6 rounded-lg border border-gray-300">
          <NameAvatar name={name} />
          <div className="flex flex-col gap-1 items-center sm:items-start">
            <PrimaryNameLabel
              name={name}
              text="Default primary name"
              address={addr}
            />
            <h2 className="text-[40px] font-medium w-max">{name}</h2>
            <Owner name={name} />
          </div>
        </div>
      </div>
    )
  return null
}

function RouteComponent() {
  const { disconnect } = useDisconnect()
  const { isConnected } = useAccount()

  const { addr } = Route.useParams()

  return (
    <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <div className="flex flex-row justify-between items-baseline">
        <h1 className="text-[28px] font-medium leading-[1]">Overview</h1>
        {isConnected && (
          <Button variant="secondary" onClick={() => disconnect()}>
            Disconnect
          </Button>
        )}
      </div>
      <PrimaryName addr={addr as Address} />
      <NameCount address={addr as Address} />
    </div>
  )
}
