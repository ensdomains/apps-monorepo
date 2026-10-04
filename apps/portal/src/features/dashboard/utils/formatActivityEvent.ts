import { parseRecordKey } from '@ens-apps/bigname'
import { type Address, isAddress } from 'viem'
import { humanizeType } from '@/features/history/summarize/descriptors'
import { sanitizeOnChainText } from '@/utils/formatting/sanitizeOnChainText'
import { recordValueText } from '@/utils/history/recordValue'
import type { RecentActivityEvent } from '../hooks/useRecentActivity'

export type FormattedActivity = {
  text: string
  /** Actor shown on the right side of the row (e.g. "registered by {actor}") */
  actor?: Address
  /** Fallback entity for the name column when event.name is null */
  entityFromData?: Address
  /** A raw on-chain value (e.g. a text-record key), shown as a neutral entity pill. */
  value?: string
}

export const formatRelativeTime = (timestamp: number): string => {
  const diffSec = Math.floor((Date.now() - timestamp * 1000) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  return `${Math.floor(diffHour / 24)}d ago`
}

const ETH_COIN_TYPE = 60

/** Raw event data is untrusted: anything that isn't an address is dropped. */
const asAddress = (value: string | undefined): Address | undefined =>
  value && isAddress(value) ? value : undefined

/** An arbitrary user-authored string as a value pill, or none if nothing printable. */
const asValue = (value: string | undefined): string | undefined =>
  // These are arbitrary user-authored bytes, and this feed is the landing page.
  sanitizeOnChainText(value ?? '') || undefined

/** Drops the optional fields that came out empty. */
const activity = ({
  text,
  actor,
  entityFromData,
  value,
}: FormattedActivity): FormattedActivity => ({
  text,
  ...(actor && { actor }),
  ...(entityFromData && { entityFromData }),
  ...(value && { value }),
})

const formatRecordEvent = (
  event: Extract<RecentActivityEvent, { type: 'record' }>,
): FormattedActivity => {
  if (event.kind === 'RecordVersionChanged')
    return { text: 'Resolver records cleared' }
  const key = event.data.key ?? ''
  const value = recordValueText(event.data.value)
  const parsed = parseRecordKey(key)
  if (parsed?.kind === 'addr') {
    // `value` is raw bytes per coin type — only a real address when ETH.
    if (parsed.coinType !== ETH_COIN_TYPE) return { text: 'Address updated' }
    return activity({
      text: 'ETH address updated',
      entityFromData: asAddress(value),
    })
  }
  if (parsed?.kind === 'text' || parsed?.kind === 'avatar')
    return activity({
      text: 'Text record updated',
      value: asValue(parsed.kind === 'text' ? parsed.key : 'avatar'),
    })
  if (parsed?.kind === 'contenthash') return { text: 'Contenthash updated' }
  // Anyone can set any string as their own reverse record and nothing here
  // forward-verifies it, so the name is a neutral value pill, not a name badge.
  if (key === 'name')
    return activity({
      text: 'Primary name updated',
      value: asValue(value),
    })
  return activity({ text: 'Record updated', value: asValue(key) })
}

/**
 * One feed row, worded by bigname's friendly type. A type bigname added after
 * this switch reads as its raw kind (or the type), so the feed never breaks on
 * one.
 */
export const formatActivityEvent = (
  event: RecentActivityEvent,
): FormattedActivity => {
  switch (event.type) {
    case 'registration':
      return activity({
        text: 'Registered by',
        actor: asAddress(event.data.registrant ?? event.data.owner),
      })
    case 'renewal':
      return { text: 'Name renewed' }
    case 'release':
      return { text: 'Name released' }
    case 'expiry':
      return { text: 'Expiry extended' }
    case 'transfer':
      return activity({
        text: 'Ownership transferred to',
        actor: asAddress(event.data.to),
      })
    case 'authority':
      return activity({
        text: 'Ownership transferred to',
        actor: asAddress(event.data.owner),
      })
    case 'resolver':
      return activity({
        text: 'Resolver updated to',
        actor: asAddress(event.data.resolver?.address),
      })
    case 'record':
      return formatRecordEvent(event)
    // The claimed name is the reverse record's unverified claim, so it is a
    // neutral value pill, not a name badge; a cleared claim has none.
    case 'primary_name':
      return activity({
        text: 'Primary name updated',
        value:
          event.data.name_status === 'set'
            ? asValue(event.data.name)
            : undefined,
      })
    case 'permission':
      return event.data.powers === undefined && event.data.fuses !== undefined
        ? { text: 'Fuses updated' }
        : activity({
            text: 'Roles updated',
            entityFromData: asAddress(event.data.address),
          })
    case 'subregistry':
      return { text: 'Subregistry updated' }
    case 'migration':
      return { text: 'Migrated to ENSv2' }
    default: {
      // `never` to the compiler; at runtime a type newer than this switch.
      const { kind, type } = event as { kind?: string; type: string }
      return { text: humanizeType(kind ?? type) }
    }
  }
}
