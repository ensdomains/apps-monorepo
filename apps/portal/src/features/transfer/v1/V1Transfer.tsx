import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Clock, Lock, ShieldX } from 'lucide-react'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { normalize } from 'viem/ens'
import { LoadingMessage } from '@/components/LoadingMessage'
import { MessageCard } from '@/components/ui/message-card'
import { LEGACY_APP_BASE_URL } from '@/lib/constants/domain'
import { getEth2LDAncestor, getParentName, is2LD } from '@/utils/ens/tldHelpers'
import { getV1NameStateQueryOptions } from './getV1NameState'
import { canParentReissueV1Subname, getV1TransferGate } from './rules'
import { V1SendName } from './V1SendName'

const Name = ({ children }: { readonly children: ReactNode }) => (
  <span className="font-medium">{children}</span>
)

const Muted = ({ children }: { readonly children: ReactNode }) => (
  <p className="text-quartz-900/60 text-sm mt-2">{children}</p>
)

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
  name: rawName,
  account,
}: {
  readonly name: string
  readonly account: Address
}) => {
  // `staleTime: 0`, not the portal's one-hour default: `useCanTransfer` primes
  // this entry on the ownership page, and a name that has since lapsed into
  // grace must not pass the gate on a cached read. (Has to live here — the
  // options helper drops `staleTime`.) The submit path re-reads and re-gates.
  const stateQuery = useQuery({
    ...getV1NameStateQueryOptions({ name: rawName }),
    staleTime: 0,
  })

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

  // Can't throw: the query already normalised the same input. The name helpers
  // below are case-sensitive, so `sub.Florin.ETH` must not reach them raw.
  const name = normalize(rawName)
  const parentName = is2LD(name) ? null : getParentName(name)
  const ancestorName = getEth2LDAncestor(name)

  // The route already refused an unregistered name before mounting this, so a
  // null state here means the ownership read and the state read disagree —
  // most likely the name changed hands (or expired) between the two.
  const state = stateQuery.data
  if (!state)
    return (
      <MessageCard
        icon={<AlertTriangle className="size-8" />}
        title="Transfer not available"
        description={
          <p>
            This name no longer appears to be registered, so there is nothing to
            transfer. Refresh to re-check.
          </p>
        }
      />
    )

  // Whether the emancipated card can point anywhere: re-issuing a lapsed V1
  // label happens in ens-app-v3 (our Subnames page is read-only for a V1
  // parent), and a burned CANNOT_CREATE_SUBDOMAIN closes even that door.
  const canReissue = canParentReissueV1Subname(state.parent)

  return match(getV1TransferGate(state, account))
    .with({ reason: 'ok' }, ({ subject, actor }) => (
      <V1SendName
        name={name}
        subject={subject}
        actor={actor}
        state={state}
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
            <Muted>
              Extend it from the Ownership page first, then come back to
              transfer.
            </Muted>
          </>
        }
        actionButton={{
          label: 'Go to ownership',
          href: `/${name}/ownership`,
          variant: 'outline',
        }}
      />
    ))
    .with({ reason: 'expired' }, () =>
      parentName ? (
        <MessageCard
          icon={<AlertTriangle className="size-8" />}
          title="This subname has expired"
          description={
            <>
              <p>
                Its expiry has passed and the Name Wrapper has cleared its
                owner. Only the owner of <Name>{parentName}</Name> can issue it
                again, so there is nothing here to transfer.
              </p>
              <Muted>Ask the parent’s owner to re-issue it.</Muted>
            </>
          }
        />
      ) : (
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
      ),
    )
    .with({ reason: 'ancestor-expired' }, () => (
      <MessageCard
        icon={<AlertTriangle className="size-8" />}
        title={`${ancestorName} has expired`}
        description={
          <>
            <p>
              This subname sits under <Name>{ancestorName}</Name>, whose
              registration and grace period have both lapsed. Whoever registers
              it next controls every name under it, so transferring this one now
              wouldn’t give the recipient anything lasting.
            </p>
            <Muted>
              Register <Name>{ancestorName}</Name> again first, then come back.
            </Muted>
          </>
        }
      />
    ))
    .with({ reason: 'ancestor-grace' }, () => (
      <MessageCard
        icon={<Clock className="size-8" />}
        title={`${ancestorName} is in its grace period`}
        description={
          <>
            <p>
              You’re reassigning this subname as the owner of its parent, but
              the Name Wrapper refuses parent changes while{' '}
              <Name>{ancestorName}</Name> is in grace — and once it expires,
              every name under it can be re-issued by whoever registers it.
            </p>
            <Muted>
              Renew <Name>{ancestorName}</Name> first, then come back to
              reassign.
            </Muted>
          </>
        }
        actionButton={{
          label: `Go to ${ancestorName}`,
          href: `/${ancestorName}/ownership`,
          variant: 'outline',
        }}
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
            <Muted>
              Burning a fuse is irreversible. Nobody, including the owner, can
              transfer this name.
            </Muted>
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
            <Muted>
              Only the owner can transfer it. Moving the manager role alone
              would leave the owner able to take it straight back.
            </Muted>
          </>
        }
      />
    ))
    .with({ reason: 'parent-cannot-reassign', why: 'emancipated' }, () => (
      <MessageCard
        icon={<Lock className="size-8" />}
        title="This subname is out of the parent’s control"
        description={
          <>
            <p>
              You own <Name>{parentName}</Name>, but this subname has burned its{' '}
              <span className="font-mono">PARENT_CANNOT_CONTROL</span> fuse.
              Until it expires, only its own owner can move it.
            </p>
            {canReissue ? (
              <Muted>
                Once it expires you can issue the label again from{' '}
                <Name>{parentName}</Name> in the ENS Manager.
              </Muted>
            ) : (
              <Muted>
                <Name>{parentName}</Name> has also burned{' '}
                <span className="font-mono">CANNOT_CREATE_SUBDOMAIN</span>, so
                it can’t issue this label again while that fuse holds.
              </Muted>
            )}
          </>
        }
        actionButton={
          canReissue && parentName
            ? {
                label: 'Open in ENS Manager',
                href: `${LEGACY_APP_BASE_URL}/${encodeURIComponent(parentName)}`,
                external: true,
                variant: 'outline',
              }
            : undefined
        }
      />
    ))
    .with({ reason: 'parent-cannot-reassign', why: 'wrapper-mismatch' }, () => (
      <MessageCard
        icon={<ShieldX className="size-8" />}
        title="Can’t reassign this subname from here"
        description={
          <>
            <p>
              You own <Name>{parentName}</Name>, but it and this subname are
              held differently — one in the Name Wrapper, the other in the plain
              registry. Reassigning across that line would forcibly wrap or
              unwrap the subname, so we don’t offer it.
            </p>
            <Muted>
              Its current owner can transfer it as usual. Otherwise, wrap or
              unwrap the two so they match, then come back.
            </Muted>
          </>
        }
      />
    ))
    .with({ reason: 'parent-cannot-reassign', why: 'registrant-only' }, () => (
      <MessageCard
        icon={<ShieldX className="size-8" />}
        title="Reclaim the parent first"
        description={
          <>
            <p>
              You hold <Name>{parentName}</Name> but another wallet manages it,
              and reassigning a subname is the manager’s power.
            </p>
            <Muted>
              As its holder you can take the role back: use{' '}
              <Name>Reclaim manager</Name> on the parent’s Ownership page, then
              come back.
            </Muted>
          </>
        }
        actionButton={
          parentName
            ? {
                label: `Go to ${parentName}`,
                href: `/${encodeURIComponent(parentName)}/ownership`,
                variant: 'outline',
              }
            : undefined
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
            <Muted>
              {parentName
                ? `Only the current owner, or the owner of ${parentName}, can move it.`
                : 'Only the current owner can transfer it.'}
            </Muted>
          </>
        }
      />
    ))
    .exhaustive()
}
