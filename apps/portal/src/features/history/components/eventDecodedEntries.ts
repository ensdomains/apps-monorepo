import type {
  TimelineDecoded,
  TimelineIndexerEvent,
} from '../hooks/useNameHistoryTimeline'
import { parseEventData } from '../summarize/decodeRawData'

const PAYLOAD_KEY_BY_TYPE: Record<string, keyof TimelineDecoded> = {
  AddressChanged: 'asAddressChanged',
  AddrChanged: 'asAddressChanged',
  TextChanged: 'asTextChanged',
  Transfer: 'asTransfer',
  RegistryTransfer: 'asRegistryTransfer',
  LabelRegistered: 'asLabelRegistered',
  NameRegistered: 'asNameRegistered',
  NameRenewed: 'asNameRenewed',
  ResolverUpdated: 'asResolverUpdated',
  ReverseClaimed: 'asReverseClaimed',
  NameWrapped: 'asNameWrapped',
  NameUnwrapped: 'asNameUnwrapped',
  FusesSet: 'asFusesSet',
  ExpiryUpdated: 'asExpiryUpdated',
}

export const getDecodedEntries = (
  event: TimelineIndexerEvent,
): [string, string][] => {
  const payloadKey = PAYLOAD_KEY_BY_TYPE[event.type]
  const source = (payloadKey && event[payloadKey]) || parseEventData(event.data)
  return Object.entries(source)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => [key, String(value)])
}
