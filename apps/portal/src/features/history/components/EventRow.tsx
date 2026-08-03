import { match } from 'ts-pattern'
import { zeroAddress } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { useBlockExplorerAddressUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { getContractLabel } from '@/utils/ens/ensContractNames'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import {
  decodeRoleChange,
  resolveDecodedName,
} from '../summarize/decodeRawData'
import { AccountBadge } from './AccountBadge'
import { DecodedParams } from './EventDetail'
import { ExpandableDetailRow } from './ExpandableDetailRow'

const Mono = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-sm">
    {children}
  </code>
)

const muted = 'text-muted-foreground text-sm'

/** A name chip when the value resolves to a full ENS name, plain mono text otherwise. */
const NameOrLabel = ({
  value,
  eventName,
}: {
  value?: string | null
  eventName?: string | null
}) => {
  if (!value) return null
  const name = resolveDecodedName(value, eventName)
  return name ? (
    <EntityBadge variant="name" name={name} compact>
      {name}
    </EntityBadge>
  ) : (
    <Mono>{value}</Mono>
  )
}

const EventContent = ({ event }: { event: TimelineIndexerEvent }) =>
  match(event.type)
    .with('LabelRegistered', () => (
      <>
        <span className={muted}>created label</span>
        <NameOrLabel
          value={event.asLabelRegistered?.name}
          eventName={event.name}
        />
      </>
    ))
    .with('NameRegistered', () => (
      <>
        <span className={muted}>registered</span>
        <NameOrLabel
          value={event.asNameRegistered?.name ?? event.name}
          eventName={event.name}
        />
      </>
    ))
    .with('Transfer', () => {
      const from = event.asTransfer?.from
      const isMint = !from || from.toLowerCase() === zeroAddress
      return (
        <>
          <span className={muted}>
            {isMint ? 'minted token ID' : 'transferred token ID'}
          </span>
          {event.asTransfer?.id && (
            <Mono>{truncateAddress(event.asTransfer.id)}</Mono>
          )}
        </>
      )
    })
    .with('EACRolesChanged', () => {
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
    })
    .with('TextChanged', () => (
      <>
        <span className={muted}>set</span>
        {event.asTextChanged?.key && <Mono>{event.asTextChanged.key}</Mono>}
      </>
    ))
    .otherwise(() => null)

interface EventRowProps {
  readonly event: TimelineIndexerEvent
}

export const EventRow = ({ event }: EventRowProps) => {
  const contractAddress = event.contractAddress ?? undefined
  const contractExplorerUrl = useBlockExplorerAddressUrl(contractAddress)

  return (
    <ExpandableDetailRow
      left={
        <>
          <Mono>{event.type}</Mono>
          <EventContent event={event} />
        </>
      }
      right={
        contractAddress ? (
          <EntityBadge
            variant="contract"
            address={contractAddress}
            label={getContractLabel(contractAddress)}
            etherscanHref={contractExplorerUrl}
            compact
          >
            {truncateAddress(contractAddress)}
          </EntityBadge>
        ) : undefined
      }
      disclosure={<DecodedParams event={event} />}
    />
  )
}
