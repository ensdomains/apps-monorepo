import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { useChainId } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { TimelineRow } from '@/components/ui/timeline'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { decodeRoleChange } from '../summarize/decodeRawData'
import { AccountBadge } from './AccountBadge'
import { getContractLabel } from './contractLabel'
import { DecodedParams } from './EventDetail'
import { DETAIL_INDENT, TIER2_INDENT } from './timelineGeometry'

const Mono = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">
    {children}
  </code>
)

/** The "{EventType} {description} {chips}" content shown on a tier-2 event row. */
const EventContent = ({ event }: { event: TimelineIndexerEvent }) => {
  const muted = 'text-muted-foreground text-sm'

  switch (event.type) {
    case 'LabelRegistered':
      return (
        <>
          <span className={muted}>created label</span>
          {event.asLabelRegistered?.name && (
            <Mono>{event.asLabelRegistered.name}</Mono>
          )}
        </>
      )
    case 'NameRegistered':
      return (
        <>
          <span className={muted}>registered</span>
          {event.asNameRegistered?.name && (
            <EntityBadge variant="name" name={event.asNameRegistered.name}>
              {event.asNameRegistered.name}
            </EntityBadge>
          )}
        </>
      )
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

  const contractLabel = getContractLabel(chainId, event.contractAddress)

  return (
    <TimelineRow
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      disclosure={
        <div className="py-1" style={{ paddingLeft: `${DETAIL_INDENT}px` }}>
          <DecodedParams event={event} />
        </div>
      }
    >
      <div
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 pr-3"
        style={{ paddingLeft: `${TIER2_INDENT}px` }}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              isOpen && 'rotate-180',
            )}
          />
          <code className="font-mono text-[14px] text-foreground">
            {event.type}
          </code>
          <EventContent event={event} />
        </div>
        <div className="justify-self-end">
          {event.contractAddress && (
            <EntityBadge
              variant="contract"
              address={event.contractAddress as Address}
              label={contractLabel}
            >
              {truncateAddress(event.contractAddress)}
            </EntityBadge>
          )}
        </div>
      </div>
    </TimelineRow>
  )
}
