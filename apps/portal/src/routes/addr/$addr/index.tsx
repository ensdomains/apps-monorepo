import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useAccount, useDisconnect, useEnsName } from 'wagmi'
import { ErrorMessage } from '@/components/molecules/ErrorMessage'
import { LoadingMessage } from '@/components/molecules/LoadingMessage'
import { NotFoundMessage } from '@/components/molecules/NotFoundMessage'
import { Button } from '@/components/ui/button'
import { NameList } from '@/features/dashboard/components/NameList'
import { NameProfileCard } from '@/features/profile/components/NameProfileCard'
export const Route = createFileRoute('/addr/$addr/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

interface PrimaryNameProps {
  address: Address
}

const PrimaryName = ({ address }: PrimaryNameProps) => {
  const {
    data: name,
    isLoading,
    error,
  } = useEnsName({
    address,
  })

  if (error) {
    const message =
      (error.cause as Error | undefined)?.message ||
      (error as Error).message ||
      'Could not load data.'
    return <ErrorMessage title="Error loading data" description={message} />
  }

  if (isLoading) return <LoadingMessage />

  if (name) return <NameProfileCard name={name} />
  return null
}

function RouteComponent() {
  const { disconnect } = useDisconnect()
  const { isConnected } = useAccount()

  const { addr } = Route.useParams() as { addr: Address }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 w-full max-w-360 mx-auto">
      <div className="flex flex-row justify-between items-baseline">
        <h1 className="text-[28px] font-medium leading-none">{addr}</h1>
        {isConnected && (
          <Button variant="secondary" onClick={() => disconnect()}>
            Disconnect
          </Button>
        )}
      </div>
      <PrimaryName address={addr} />
      <h2 className="font-medium text-[26px]">Names</h2>
      <NameList address={addr} />
    </div>
  )
}
