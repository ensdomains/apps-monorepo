import { isAddress } from 'viem'
import {
  parseEventData,
  readString,
} from '@/features/history/summarize/decodeRawData'
import { sanitizeOnChainText } from '@/utils/formatting/sanitizeOnChainText'
import type { RecentActivityEvent } from '../hooks/useRecentActivity'

type ActivityEntity = {
  type: 'address' | 'name'
  value: string
}

export type FormattedActivity = {
  text: string
  /** Actor shown on the right side of the row (e.g. "registered by {actor}") */
  actor?: ActivityEntity
  /** Fallback entity for the name column when event.name is null */
  entityFromData?: ActivityEntity
  /** A raw on-chain value (e.g. a text-record key), shown as a neutral entity pill. */
  value?: string
}

type StaticDescriptor = {
  text: string
  actorField?: string
  actorType?: 'address' | 'name'
  /** Extract a display entity from data when event.name is null */
  entityField?: string
  entityType?: 'address' | 'name'
  /** Raw data field shown as a value pill after the text (e.g. text record key) */
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
    actorType: 'address',
  },
  LabelRegistered: {
    text: 'Registered by',
    actorField: 'owner',
    actorType: 'address',
  },
  NameRenewed: { text: 'Name renewed' },

  // ERC-1155/721 transfers carry `to`; the registry's Transfer carries `owner`.
  Transfer: (data) => {
    const to = readString(data, 'to', 'owner')
    return {
      text: 'Ownership transferred to',
      actor: to ? { type: 'address', value: to } : undefined,
    }
  },
  NewOwner: {
    text: 'Subname created by',
    actorField: 'owner',
    actorType: 'address',
  },

  // Resolver
  ResolverUpdated: {
    text: 'Resolver updated to',
    actorField: 'resolver',
    actorType: 'address',
  },
  AddrChanged: { text: 'ETH address updated' },
  // `address` is raw bytes per coin type — only a real address when ETH.
  AddressChanged: (data) => {
    const coinType = data.coinType
    const address = readString(data, 'address')
    if (coinType !== ETH_COIN_TYPE) return { text: 'Address updated' }
    return {
      text: 'ETH address updated',
      entityFromData:
        address && isAddress(address)
          ? { type: 'address', value: address }
          : undefined,
    }
  },
  TextChanged: { text: 'Text record updated', valueField: 'key' },
  ContenthashChanged: { text: 'Contenthash updated' },
  VersionChanged: { text: 'Resolver records cleared' },

  // Name / reverse resolution — name lives inside data.name
  NameChanged: {
    text: 'Primary name updated',
    entityField: 'name',
    entityType: 'name',
  },

  // Migration
  NameWrapped: { text: 'Migrated from ENSv1 to ENSv2' },
  NameUnwrapped: { text: 'Unwrapped from ENSv2' },

  // Access control — account lives inside data.account
  EACRolesChanged: {
    text: 'Roles updated',
    entityField: 'account',
    entityType: 'address',
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
  if (!descriptor) return { text: event.type }

  const parsedData = parseEventData(event.data)
  if (typeof descriptor === 'function') return descriptor(parsedData)

  const result: FormattedActivity = { text: descriptor.text }

  if (descriptor.valueField) {
    const raw = readString(parsedData, descriptor.valueField)
    // Anyone can put arbitrary bytes in a text record key, and this feed is the
    // landing page for every visitor — sanitize before it reaches the row.
    const value = raw && sanitizeOnChainText(raw)
    if (value) result.value = value
  }

  if (descriptor.actorField) {
    const actorValue = readString(parsedData, descriptor.actorField)
    if (actorValue) {
      result.actor = {
        type: descriptor.actorType ?? 'address',
        value: actorValue,
      }
    }
  }

  if (descriptor.entityField) {
    const entityValue = readString(parsedData, descriptor.entityField)
    if (entityValue) {
      result.entityFromData = {
        type: descriptor.entityType ?? 'name',
        value: entityValue,
      }
    }
  }

  return result
}
