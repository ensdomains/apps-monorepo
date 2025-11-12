import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useAccount, useDisconnect, useEnsName } from 'wagmi'
import { Button } from '@/components/ui/button'
import { NameCount } from '@/features/dashboard/components/NameCount'
import { NameProfileCard } from '@/features/profile/components/NameProfileCard'
export const Route = createFileRoute('/addr/$addr/')({
  component: RouteComponent,
})

interface PrimaryNameProps {
  addr: Address
}

const PrimaryName = ({ addr }: PrimaryNameProps) => {
  const {
    data: name,
    isLoading,
    error,
  } = useEnsName({
    address: addr as Address,
  })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (name) return <NameProfileCard name={name} />
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
