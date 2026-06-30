import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, ShieldX } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { MessageCard } from '@/components/ui/message-card'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { useNameResolverAddress } from '@/features/records/hooks/useNameResolverAddress'
import { SendNameForm } from '@/features/transfer/components/SendNameForm'

export const Route = createFileRoute('/$name/ownership/transfer')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { name } = Route.useParams()
  const { address } = useConnection()

  const ownerQuery = useQuery(getEnsOwnerQueryOptions({ name }))
  const resolverQuery = useNameResolverAddress({ name })

  if (ownerQuery.isLoading) return <LoadingMessage />

  if (ownerQuery.error)
    return (
      <ErrorMessage
        title="Failed to load name"
        description={ownerQuery.error.cause.message}
      />
    )

  const data = ownerQuery.data

  return (
    <div className="flex flex-col items-center px-8 py-6 w-full">
      <div className="flex flex-col gap-6 max-w-2xl w-full">
        <Link
          to="/$name/ownership"
          params={{ name }}
          className="flex items-center gap-1 text-muted-foreground hover:text-muted-foreground text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <h1 className="text-3xl font-medium leading-tight">
          Transfer ownership
        </h1>

        {match({ data, address })
          .with({ data: P.nullish }, () => <NotV2Message />)
          .with({ data: { protocolVersion: P.not('ENSv2') } }, () => (
            <NotV2Message />
          ))
          .with({ address: P.nullish }, () => <ConnectWalletMessage />)
          .with(
            { data: P.nonNullable, address: P.string },
            ({ data, address }) =>
              isAddressEqual(address, data.owner) ? (
                <SendNameForm
                  name={name}
                  registryAddress={data.registryAddress}
                  owner={data.owner}
                  currentResolverAddress={normalizeResolver(resolverQuery.data)}
                />
              ) : (
                <NotOwnerMessage />
              ),
          )
          .exhaustive()}
      </div>
    </div>
  )
}

const normalizeResolver = (
  resolver: Address | null | undefined,
): Address | undefined =>
  !resolver || resolver === zeroAddress ? undefined : resolver

const NotV2Message = () => (
  <MessageCard
    icon={<AlertTriangle className="size-8" />}
    title="Transfer not available"
    description={<p>Sending a name is only available for ENSv2 names.</p>}
  />
)

const NotOwnerMessage = () => (
  <MessageCard
    icon={<ShieldX className="size-8" />}
    title="Not authorized"
    description={
      <>
        <p>You are not the owner of this name.</p>
        <p className="text-quartz-900/60 text-sm mt-2">
          Only the current owner can transfer it.
        </p>
      </>
    }
  />
)

const ConnectWalletMessage = () => (
  <MessageCard
    icon={<ShieldX className="size-8" />}
    title="Connect your wallet"
    description={<p>Connect the wallet that owns this name to transfer it.</p>}
  />
)
