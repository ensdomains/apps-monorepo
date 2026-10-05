import { match } from 'ts-pattern'
import { isAddress } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { sanitizeOnChainText } from '@/utils/formatting/sanitizeOnChainText'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { formatPower, migrationPathLabel } from '../summarize/descriptors'
import type { TimelineEvent, TimelineEventOfType } from '../timelineEvent'
import { AccountBadge } from './AccountBadge'
import { ContractBadge } from './ContractBadge'
import { DecodedParams } from './EventDetail'
import { ExpandableDetailRow } from './ExpandableDetailRow'
import { transferRowContent } from './transferRowContent'

const ActionValue = ({
  children,
  copyValue,
}: {
  children: React.ReactNode
  copyValue: string
}) => (
  <EntityBadge variant="default" type="action" copyValue={copyValue} compact>
    {children}
  </EntityBadge>
)

const muted = 'text-muted-foreground text-p'

const NameChip = ({ name }: { name: string }) =>
  name ? (
    <EntityBadge variant="name" name={name} compact>
      {name}
    </EntityBadge>
  ) : null

/** "minted token ID {id} to {account}", the token id only where it is exact. */
const TransferContent = ({
  event,
}: {
  event: TimelineEventOfType<'transfer'>
}) => {
  const content = transferRowContent(event)
  if (!content) return null
  const { label, token, recipient } = content
  return (
    <>
      <span className={muted}>{label}</span>
      {token && (
        <ActionValue copyValue={token.tokenId}>
          {truncateAddress(token.tokenId)}
        </ActionValue>
      )}
      {token && recipient && <span className={muted}>to</span>}
      {recipient && <AccountBadge address={recipient} />}
    </>
  )
}

const EventContent = ({ event }: { event: TimelineEvent }) =>
  match(event)
    .with({ type: 'registration' }, (e) => (
      <>
        <span className={muted}>
          {e.subject === 'child' ? 'registered subname' : 'registered'}
        </span>
        <NameChip name={e.name} />
      </>
    ))
    .with({ type: 'transfer' }, (e) => <TransferContent event={e} />)
    .with({ type: 'permission' }, (e) => {
      const powers = e.data.powers ?? []
      return (
        <>
          <span className={muted}>
            {powers.length
              ? `${powers.length} ${powers.length === 1 ? 'power' : 'powers'} held by`
              : 'no powers left for'}
          </span>
          {e.data.address && isAddress(e.data.address, { strict: false }) && (
            <AccountBadge address={e.data.address} />
          )}
          {powers.length > 0 && (
            <span className={muted}>{powers.map(formatPower).join(', ')}</span>
          )}
        </>
      )
    })
    .with({ type: 'migration' }, (e) => {
      const path = migrationPathLabel(e.data.migration_path)
      return (
        <span className={muted}>migrated to ENSv2{path && ` (${path})`}</span>
      )
    })
    .with({ type: 'record' }, (e) => {
      const key = e.data.key ?? ''
      // Copy hands over the real stored key — a sanitized one would no longer
      // match the record it came from.
      const label = sanitizeOnChainText(key)
      return (
        <>
          <span className={muted}>
            {e.kind === 'RecordVersionChanged' ? 'cleared records' : 'set'}
          </span>
          {label && <ActionValue copyValue={key}>{label}</ActionValue>}
        </>
      )
    })
    .otherwise(() => null)

interface EventRowProps {
  readonly event: TimelineEvent
}

export const EventRow = ({ event }: EventRowProps) => {
  // The raw kind when the read carried it, which is what an explorer row names.
  const badge = event.kind ?? event.type

  return (
    <ExpandableDetailRow
      left={
        <>
          <ActionValue copyValue={badge}>{badge}</ActionValue>
          <EventContent event={event} />
        </>
      }
      right={
        event.contractAddress ? (
          <ContractBadge
            address={event.contractAddress}
            label={event.type === 'record' ? 'resolver' : undefined}
          />
        ) : undefined
      }
      disclosure={<DecodedParams event={event} />}
    />
  )
}
