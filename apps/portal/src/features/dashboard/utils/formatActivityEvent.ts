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
}

const EVENT_DESCRIPTORS: Record<
  string,
  {
    text: string
    actorField?: string
    actorType?: 'address' | 'name'
    /** Extract a display entity from data when event.name is null */
    entityField?: string
    entityType?: 'address' | 'name'
  }
> = {
  // Registration
  NameRegistered: {
    text: 'registered by',
    actorField: 'owner',
    actorType: 'address',
  },
  LabelRegistered: {
    text: 'registered by',
    actorField: 'owner',
    actorType: 'address',
  },
  NameRenewed: { text: 'renewed' },

  // Ownership
  Transfer: {
    text: 'ownership transferred to',
    actorField: 'to',
    actorType: 'address',
  },
  NewOwner: {
    text: 'subname created by',
    actorField: 'owner',
    actorType: 'address',
  },

  // Resolver
  ResolverUpdated: {
    text: 'resolver updated to',
    actorField: 'resolver',
    actorType: 'address',
  },
  AddrChanged: { text: 'ETH address updated' },
  TextChanged: { text: 'text record updated' },
  ContenthashChanged: { text: 'contenthash updated' },
  VersionChanged: { text: 'resolver records cleared' },

  // Name / reverse resolution — name lives inside data.name
  NameChanged: {
    text: 'primary name updated',
    entityField: 'name',
    entityType: 'name',
  },

  // Migration
  NameWrapped: { text: 'migrated from ENSv1 to ENSv2' },
  NameUnwrapped: { text: 'unwrapped from ENSv2' },

  // Access control — account lives inside data.account
  EACRolesChanged: {
    text: 'roles updated',
    entityField: 'account',
    entityType: 'address',
  },
  FusesSet: { text: 'fuses updated' },
  ExpiryExtended: { text: 'expiry extended' },
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

  let parsedData: Record<string, string> = {}
  try {
    parsedData = JSON.parse(event.data) as Record<string, string>
  } catch {
    // data field is not valid JSON
  }

  const result: FormattedActivity = { text: descriptor.text }

  if (descriptor.actorField) {
    const actorValue = parsedData[descriptor.actorField]
    if (actorValue) {
      result.actor = {
        type: descriptor.actorType ?? 'address',
        value: actorValue,
      }
    }
  }

  if (descriptor.entityField) {
    const entityValue = parsedData[descriptor.entityField]
    if (entityValue) {
      result.entityFromData = {
        type: descriptor.entityType ?? 'name',
        value: entityValue,
      }
    }
  }

  return result
}
