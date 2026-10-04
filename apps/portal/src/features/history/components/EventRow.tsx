import { match } from 'ts-pattern'
import { isAddress } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { sanitizeOnChainText } from '@/utils/formatting/sanitizeOnChainText'
import { formatPower } from '../summarize/descriptors'
import type { TimelineEvent } from '../timelineEvent'
import { AccountBadge } from './AccountBadge'
import { ContractBadge } from './ContractBadge'
import { DecodedParams } from './EventDetail'
import { ExpandableDetailRow } from './ExpandableDetailRow'

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
    .with({ type: 'transfer' }, (e) =>
      e.data.to && isAddress(e.data.to, { strict: false }) ? (
        <>
          <span className={muted}>
            {e.data.from ? 'transferred to' : 'minted to'}
          </span>
          <AccountBadge address={e.data.to} />
        </>
      ) : null,
    )
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
