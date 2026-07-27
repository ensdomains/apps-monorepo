import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { parseEventData } from '../summarize/decodeRawData'

/** The typed `as*` payload matching an event's type, if the indexer decoded one. */
const pickTypedPayload = (
  event: TimelineIndexerEvent,
): Record<string, unknown> | undefined => {
  switch (event.type) {
    case 'AddressChanged':
    case 'AddrChanged':
      return event.asAddressChanged ?? undefined
    case 'TextChanged':
      return event.asTextChanged ?? undefined
    case 'Transfer':
      return event.asTransfer ?? undefined
    case 'RegistryTransfer':
      return event.asRegistryTransfer ?? undefined
    case 'LabelRegistered':
      return event.asLabelRegistered ?? undefined
    case 'NameRegistered':
      return event.asNameRegistered ?? undefined
    case 'NameRenewed':
      return event.asNameRenewed ?? undefined
    case 'ResolverUpdated':
      return event.asResolverUpdated ?? undefined
    case 'ReverseClaimed':
      return event.asReverseClaimed ?? undefined
    case 'NameWrapped':
      return event.asNameWrapped ?? undefined
    case 'NameUnwrapped':
      return event.asNameUnwrapped ?? undefined
    case 'FusesSet':
      return event.asFusesSet ?? undefined
    case 'ExpiryUpdated':
      return event.asExpiryUpdated ?? undefined
    default:
      return undefined
  }
}

/**
 * Full ENS name a decoded `name` param refers to, if determinable: the value itself
 * when it is already a full name, or the event's domain when the value is its leading
 * label (e.g. LabelRegistered emits the bare label of the name it created).
 */
export const resolveDecodedName = (
  value: string,
  eventName?: string | null,
): string | undefined => {
  if (value.includes('.')) return value
  if (eventName && (eventName === value || eventName.startsWith(`${value}.`)))
    return eventName
  return undefined
}

/**
 * Decoded parameter entries for the tier-3 detail table. Prefers the typed `as*`
 * payload; falls back to the raw `data` JSON blob for types without a decoder.
 */
export const getDecodedEntries = (
  event: TimelineIndexerEvent,
): [string, string][] => {
  const source = pickTypedPayload(event) ?? parseEventData(event.data)
  return Object.entries(source)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => [key, String(value)])
}
