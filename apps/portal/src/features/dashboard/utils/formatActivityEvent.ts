import { type Address, isAddress } from 'viem'
import {
  parseEventData,
  readString,
} from '@/features/history/summarize/decodeRawData'
import { humanizeType } from '@/features/history/summarize/descriptors'
import { sanitizeOnChainText } from '@/utils/formatting/sanitizeOnChainText'
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

type StaticDescriptor = {
  text: string
  /** Address field shown as the actor, e.g. the owner of a registration */
  actorField?: string
  /** Address field shown in the name column when event.name is null */
  entityField?: string
  /** Raw data field shown as an unlinked value pill after the text (e.g. text record key) */
  valueField?: string
}

/** Events whose rendering depends on more than one raw field build their row directly. */
type Descriptor =
  | StaticDescriptor
  | ((data: Record<string, unknown>) => FormattedActivity)

const ETH_COIN_TYPE = 60

const EVENT_DESCRIPTORS: Record<string, Descriptor> = {
  // Registration
  NameRegistered: {
    text: 'Registered by',
    actorField: 'owner',
  },
  LabelRegistered: {
    text: 'Registered by',
    actorField: 'owner',
  },
  NameRenewed: { text: 'Name renewed' },

  // ERC-1155/721 transfers carry `to`; the registry's Transfer carries `owner`.
  Transfer: (data) => {
    const to = readString(data, 'to', 'owner') ?? ''
    return {
      text: 'Ownership transferred to',
      actor: isAddress(to) ? to : undefined,
    }
  },
  NewOwner: {
    text: 'Subname created by',
    actorField: 'owner',
  },

  // Resolver
  ResolverUpdated: {
    text: 'Resolver updated to',
    actorField: 'resolver',
  },
  AddrChanged: { text: 'ETH address updated' },
  // `address` is raw bytes per coin type — only a real address when ETH.
  AddressChanged: (data) => {
    const coinType = data.coinType
    const address = readString(data, 'address') ?? ''
    if (coinType !== ETH_COIN_TYPE) return { text: 'Address updated' }
    return {
      text: 'ETH address updated',
      entityFromData: isAddress(address) ? address : undefined,
    }
  },
  TextChanged: { text: 'Text record updated', valueField: 'key' },
  ContenthashChanged: { text: 'Contenthash updated' },
  VersionChanged: { text: 'Resolver records cleared' },

  // Anyone can set any string as their own reverse record and nothing here
  // forward-verifies it, so the name is a neutral value pill, not a name badge.
  NameChanged: { text: 'Primary name updated', valueField: 'name' },

  // Migration
  NameWrapped: { text: 'Migrated from ENSv1 to ENSv2' },
  NameUnwrapped: { text: 'Unwrapped from ENSv2' },

  // Access control — account lives inside data.account
  EACRolesChanged: {
    text: 'Roles updated',
    entityField: 'account',
  },
  FusesSet: { text: 'Fuses updated' },
  ExpiryExtended: { text: 'Expiry extended' },
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

export const formatActivityEvent = (
  event: RecentActivityEvent,
): FormattedActivity => {
  const descriptor = EVENT_DESCRIPTORS[event.type]
  if (!descriptor) return { text: humanizeType(event.type) }

  const parsedData = parseEventData(event.data)
  if (typeof descriptor === 'function') return descriptor(parsedData)

  const result: FormattedActivity = { text: descriptor.text }

  if (descriptor.valueField) {
    // These are arbitrary user-authored bytes, and this feed is the landing page.
    const value = sanitizeOnChainText(
      readString(parsedData, descriptor.valueField) ?? '',
    )
    if (value) result.value = value
  }

  // Raw event data is untrusted: anything that isn't an address is dropped.
  if (descriptor.actorField) {
    const actor = readString(parsedData, descriptor.actorField) ?? ''
    if (isAddress(actor)) result.actor = actor
  }

  if (descriptor.entityField) {
    const entity = readString(parsedData, descriptor.entityField) ?? ''
    if (isAddress(entity)) result.entityFromData = entity
  }

  return result
}
