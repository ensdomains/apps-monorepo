import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { parseEventData } from '../summarize/decodeRawData'

export { resolveDecodedName } from '../summarize/decodeRawData'

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
