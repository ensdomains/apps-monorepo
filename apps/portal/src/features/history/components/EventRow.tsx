import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { useChainId } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { TimelineRow } from '@/components/ui/timeline'
import { cn } from '@/lib/utils'
import { useBlockExplorerAddressUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { getEnsContractName } from '@/utils/ens/ensContractNames'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { decodeRoleChange } from '../summarize/decodeRawData'
import { AccountBadge } from './AccountBadge'
import { DecodedParams } from './EventDetail'
import { resolveDecodedName } from './eventDecodedEntries'

const Mono = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-sm">
    {children}
  </code>
)

const muted = 'text-muted-foreground text-sm'

const LabelRegisteredContent = ({ event }: { event: TimelineIndexerEvent }) => {
  const label = event.asLabelRegistered?.name
  const fullName = label ? resolveDecodedName(label, event.name) : undefined
  return (
    <>
      <span className={muted}>created label</span>
      {label &&
        (fullName ? (
          <EntityBadge variant="name" name={fullName} compact>
            {label}
          </EntityBadge>
        ) : (
          <Mono>{label}</Mono>
        ))}
    </>
  )
}

const NameRegisteredContent = ({ event }: { event: TimelineIndexerEvent }) => {
  // The indexer often carries only the bare label — resolve it against the
  // event's domain so "troy" still badges as troy.eth.
  const registered =
    event.asNameRegistered?.name ?? event.asNameRegistered?.label
  const registeredName = registered
    ? resolveDecodedName(registered, event.name)
    : undefined
  return (
    <>
      <span className={muted}>registered</span>
      {registeredName && (
        <EntityBadge variant="name" name={registeredName} compact>
          {registeredName}
        </EntityBadge>
      )}
    </>
  )
}

const EventContent = ({ event }: { event: TimelineIndexerEvent }) => {
  switch (event.type) {
    case 'LabelRegistered':
      return <LabelRegisteredContent event={event} />
    case 'NameRegistered':
      return <NameRegisteredContent event={event} />
    case 'Transfer':
      return (
        <>
          <span className={muted}>minted token ID</span>
          {event.asTransfer?.id && (
            <Mono>{truncateAddress(event.asTransfer.id)}</Mono>
          )}
        </>
      )
    case 'EACRolesChanged': {
      const change = decodeRoleChange(event.data)
      const verb = change.direction === 'revoke' ? 'revoked from' : 'granted to'
      return (
        <>
          <span className={muted}>
            {change.roles.length || ''}{' '}
            {change.roles.length === 1 ? 'role' : 'roles'} {verb}
          </span>
          {change.account && <AccountBadge address={change.account} />}
        </>
      )
    }
    case 'TextChanged':
      return (
        <>
          <span className={muted}>set</span>
          {event.asTextChanged?.key && <Mono>{event.asTextChanged.key}</Mono>}
        </>
      )
    default:
      return null
  }
}

interface EventRowProps {
  readonly event: TimelineIndexerEvent
}

/**
 * Tier-2 event row: `{EventType} {description}` on the left with a down-caret, the
 * emitting-contract pill on the right, expanding inline to the decoded params (Figma).
 */
export const EventRow = ({ event }: EventRowProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const chainId = useChainId()

  const contractAddress = (event.contractAddress ?? undefined) as
    | Address
    | undefined
  const contractLabel = contractAddress
    ? getEnsContractName(chainId, contractAddress)
    : undefined
  const contractExplorerUrl = useBlockExplorerAddressUrl(contractAddress)

  return (
    <TimelineRow
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      className="ml-(--tier2-indent) pl-2"
      disclosure={
        <div className="py-1 pl-(--detail-indent)">
          <DecodedParams event={event} />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-y-1 py-2 pr-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-3 sm:gap-y-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              isOpen && 'rotate-180',
            )}
          />
          <Mono>{event.type}</Mono>
          <EventContent event={event} />
        </div>
        <div className="justify-self-start sm:justify-self-end">
          {contractAddress && (
            <EntityBadge
              variant="contract"
              address={contractAddress}
              label={contractLabel}
              etherscanHref={contractExplorerUrl}
              compact
            >
              {truncateAddress(contractAddress)}
            </EntityBadge>
          )}
        </div>
      </div>
    </TimelineRow>
  )
}
