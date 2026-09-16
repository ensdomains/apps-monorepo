import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, ShieldX } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { MessageCard } from '@/components/ui/message-card'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { V2SendName } from '@/features/transfer/components/V2SendName'
import { useCanTransferName } from '@/features/transfer/hooks/useCanTransferName'
import { getSubnameExpiryQueryOptions } from '@/features/transfer/queries/getSubnameExpiry'
import { V1Transfer } from '@/features/transfer/v1/V1Transfer'
import { getParentName, is2LD } from '@/utils/ens/tldHelpers'

export const Route = createFileRoute('/$name/ownership/transfer')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { name } = Route.useParams()
  const { address } = useConnection()

  const ownerQuery = useQuery(getEnsOwnerQueryOptions({ name }))

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
          <ArrowLeft className="size-4" />
          Back
        </Link>

        <PageHeading parent={{ type: 'name', name }}>
          Transfer ownership
        </PageHeading>

        {match({ data, address })
          .with({ data: P.nullish }, () => (
            <MessageCard
              icon={<AlertTriangle className="size-8" />}
              title="Transfer not available"
              description={
                is2LD(name) ? (
                  <p>
                    This name isn’t registered, so there is nothing to transfer.
                  </p>
                ) : (
                  <p>
                    This subname doesn’t exist under{' '}
                    <span className="font-medium">{getParentName(name)}</span>,
                    so there is nothing to transfer.
                  </p>
                )
              }
            />
          ))
          .with({ address: P.nullish }, () => (
            <MessageCard
              icon={<ShieldX className="size-8" />}
              title="Connect your wallet"
              description={
                <p>Connect the wallet that owns this name to transfer it.</p>
              }
            />
          ))
          // V1 ownership isn't one address: an unwrapped 2LD splits it between
          // registrant and controller, and `getEnsOwner` reports the latter. The
          // V1 gate re-reads the full shape and decides who may transfer.
          .with(
            { data: { protocolVersion: 'ENSv1' }, address: P.string },
            ({ address }) => <V1Transfer name={name} account={address} />,
          )
          .with(
            { data: P.nonNullable, address: P.string },
            ({ data, address }) => isAddressEqual(address, data.owner),
            ({ data }) => (
              <AuthorizedTransfer
                name={name}
                registryAddress={data.registryAddress}
                owner={data.owner}
              />
            ),
          )
          .with({ data: P.nonNullable, address: P.string }, () => (
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
          ))
          .exhaustive()}
      </div>
    </div>
  )
}

/**
 * The connected wallet owns the V2 name — but token ownership alone doesn't
 * guarantee a transfer will succeed, or that it's worth making. The registry
 * reverts unless the owner also holds ROLE_CAN_TRANSFER_ADMIN, and the transfer
 * flow runs irreversible detach steps before the token moves. A subname has a
 * second gate: once it expires, its parent can re-issue it to anyone, so
 * transferring an expired one hands the recipient nothing. Confirm both before
 * offering the form rather than walking the user into a partial, unrecoverable
 * failure — or a pointless one.
 */
const AuthorizedTransfer = ({
  name,
  registryAddress,
  owner,
}: {
  readonly name: string
  readonly registryAddress: Address
  readonly owner: Address
}) => {
  const isSubname = !is2LD(name)

  const { canTransfer, isLoading, isError } = useCanTransferName({
    name,
    registryAddress,
    account: owner,
  })

  const expiryQuery = useQuery({
    ...getSubnameExpiryQueryOptions({ name, registryAddress }),
    enabled: isSubname,
  })

  // Mirrors `PermissionedRegistry._isExpired`: `block.timestamp >= expiry`. A
  // zero expiry is *not* "never expires" — the registry has no such value, and
  // `_isExpired(0)` is true — so it is blocked like any other lapsed name.
  const isExpired =
    expiryQuery.data !== undefined &&
    expiryQuery.data <= BigInt(Math.floor(Date.now() / 1000))

  if (isLoading || expiryQuery.isLoading) return <LoadingMessage />

  if (expiryQuery.isError)
    return (
      <MessageCard
        icon={<AlertTriangle className="size-8" />}
        title="Couldn’t check this subname’s expiry"
        description={
          <p>
            We couldn’t confirm whether this subname is still registered.
            Refresh and try again before starting a transfer.
          </p>
        }
      />
    )

  if (isExpired)
    return (
      <MessageCard
        icon={<AlertTriangle className="size-8" />}
        title="This subname has expired"
        description={
          <>
            <p>
              This subname’s registration has lapsed, so the owner of{' '}
              <span className="font-medium">{getParentName(name)}</span> can
              re-issue it to anyone. Transferring it now wouldn’t give the
              recipient lasting control.
            </p>
            <p className="text-quartz-900/60 text-sm mt-2">
              Ask the parent’s owner to renew it before transferring.
            </p>
          </>
        }
      />
    )

  if (isError)
    return (
      <MessageCard
        icon={<AlertTriangle className="size-8" />}
        title="Couldn’t check transfer permission"
        description={
          <p>
            We couldn’t confirm whether this name can be transferred. Refresh
            and try again before starting a transfer.
          </p>
        }
      />
    )

  if (!canTransfer)
    return (
      <MessageCard
        icon={<ShieldX className="size-8" />}
        title="Transfer not available"
        description={
          <>
            <p>
              This wallet can’t transfer this name. Transferring requires a
              permission on the name’s token that this wallet doesn’t hold.
            </p>
            <p className="text-quartz-900/60 text-sm mt-2">
              This is common for subnames issued without transfer rights, or
              names whose transfer role was revoked or locked. Ask whoever
              issued the name to grant the transfer role
              (ROLE_CAN_TRANSFER_ADMIN), or transfer from the wallet that holds
              it.
            </p>
          </>
        }
      />
    )

  return (
    <V2SendName name={name} registryAddress={registryAddress} owner={owner} />
  )
}
