import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Clock, Lock, ShieldX } from 'lucide-react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { LoadingMessage } from '@/components/LoadingMessage'
import { MessageCard } from '@/components/ui/message-card'
import { getV1NameStateQueryOptions } from './getV1NameState'
import { getV1TransferGate } from './rules'
import { V1SendName } from './V1SendName'

/**
 * Gate for transferring a V1 name: reads the name's state, refuses with a
 * reason the sender can act on, or hands off to the form.
 *
 * Refusing up front matters more here than in V2. The V1 registry reverts with
 * no reason string, the registrar's `ownerOf` reverts silently once a name
 * lapses, and the config steps run before the move — so a transfer that fails
 * halfway leaves the name degraded with nothing to decode.
 */
export const V1Transfer = ({
  name,
  account,
}: {
  readonly name: string
  readonly account: Address
}) => {
  const stateQuery = useQuery(getV1NameStateQueryOptions({ name }))

  if (stateQuery.isLoading) return <LoadingMessage />

  if (stateQuery.isError)
    return (
      <MessageCard
        icon={<AlertTriangle className="size-8" />}
        title="Couldn’t check this name"
        description={
          <p>
            We couldn’t read how this name is held, so we can’t tell whether it
            can be transferred. Refresh and try again.
          </p>
        }
      />
    )

  const state = stateQuery.data
  if (!state)
    return (
      <MessageCard
        icon={<AlertTriangle className="size-8" />}
        title="Transfer not available"
        description={
          <p>This name isn’t registered, so there is nothing to transfer.</p>
        }
      />
    )

  return match(getV1TransferGate(state, account))
    .with({ reason: 'ok' }, ({ subject }) => (
      <V1SendName
        name={name}
        subject={subject}
        resolverAddress={state.resolverAddress}
        parentOwner={state.parentOwner}
        account={account}
      />
    ))
    .with({ reason: 'grace' }, () => (
      <MessageCard
        icon={<Clock className="size-8" />}
        title="This name is in its grace period"
        description={
          <>
            <p>
              Its registration has lapsed. Transfers are locked until it is
              renewed — the registrar refuses to move an expired name.
            </p>
            <p className="text-quartz-900/60 text-sm mt-2">
              Extend it from the Ownership page first, then come back to
              transfer.
            </p>
          </>
        }
        actionButton={{
          label: 'Go to ownership',
          href: `/${name}/ownership`,
          variant: 'outline',
        }}
      />
    ))
    .with({ reason: 'expired' }, () => (
      <MessageCard
        icon={<AlertTriangle className="size-8" />}
        title="This name has expired"
        description={
          <p>
            Its registration and grace period have both lapsed, so anyone can
            register it. There is nothing left to transfer.
          </p>
        }
      />
    ))
    .with({ reason: 'cannot-transfer' }, () => (
      <MessageCard
        icon={<Lock className="size-8" />}
        title="Transfer permanently disabled"
        description={
          <>
            <p>
              This name’s <span className="font-mono">CANNOT_TRANSFER</span>{' '}
              fuse has been burned, so the Name Wrapper refuses to move it.
            </p>
            <p className="text-quartz-900/60 text-sm mt-2">
              Burning a fuse is irreversible. Nobody, including the owner, can
              transfer this name.
            </p>
          </>
        }
      />
    ))
    .with({ reason: 'manager-only' }, ({ registrant }) => (
      <MessageCard
        icon={<ShieldX className="size-8" />}
        title="You manage this name but don’t own it"
        description={
          <>
            <p>
              Your wallet is this name’s manager: it controls the records and
              subnames. The owner, who holds the name itself, is{' '}
              <span className="font-mono break-all">{registrant}</span>.
            </p>
            <p className="text-quartz-900/60 text-sm mt-2">
              Only the owner can transfer it. Moving the manager role alone
              would leave the owner able to take it straight back.
            </p>
          </>
        }
      />
    ))
    .with({ reason: 'not-owner' }, () => (
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
    .exhaustive()
}
