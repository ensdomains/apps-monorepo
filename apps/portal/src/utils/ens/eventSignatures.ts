import type {
  DomainEventKey,
  RegistrationEventKey,
  ResolverEventKey,
} from '@ensdomains/ensjs/subgraph'

export type EventKey = DomainEventKey | RegistrationEventKey | ResolverEventKey

// Event signatures mapping based on ENS subgraph types
const EVENT_SIGNATURES: Record<EventKey, string> = {
  // Domain Events
  Transfer: 'Transfer (bytes32 indexed node, address owner)',
  NewOwner:
    'NewOwner (bytes32 indexed node, bytes32 indexed label, address owner)',
  NewResolver: 'NewResolver (bytes32 indexed node, address resolver)',
  NewTTL: 'NewTTL (bytes32 indexed node, uint64 ttl)',
  WrappedTransfer:
    'Transfer (bytes32 indexed node, address indexed from, address indexed to, uint256 tokenId)',
  NameWrapped:
    'NameWrapped (bytes32 indexed node, bytes name, address owner, uint32 fuses, uint64 expiry)',
  NameUnwrapped: 'NameUnwrapped (bytes32 indexed node, address owner)',
  FusesSet: 'FusesSet (bytes32 indexed node, uint32 fuses)',
  ExpiryExtended: 'ExpiryExtended (bytes32 indexed node, uint64 expiry)',
  // Registration Events
  NameRegistered:
    'NameRegistered (string name, bytes32 indexed label, address indexed owner, uint256 cost, uint256 expires)',
  NameRenewed:
    'NameRenewed (string name, bytes32 indexed label, uint256 cost, uint256 expires)',
  NameTransferred:
    'NameTransferred (string name, bytes32 indexed label, address indexed newOwner)',
  // Resolver Events
  AddrChanged: 'AddrChanged (bytes32 indexed node, address a)',
  MulticoinAddrChanged:
    'AddressChanged (bytes32 indexed node, uint256 coinType, bytes newAddress)',
  NameChanged: 'NameChanged (bytes32 indexed node, string name)',
  AbiChanged: 'ABIChanged (bytes32 indexed node, uint256 indexed contentType)',
  PubkeyChanged: 'PubkeyChanged (bytes32 indexed node, bytes32 x, bytes32 y)',
  TextChanged:
    'TextChanged (bytes32 indexed node, string indexed indexedKey, string key, string value)',
  ContenthashChanged: 'ContenthashChanged (bytes32 indexed node, bytes hash)',
  InterfaceChanged:
    'InterfaceChanged (bytes32 indexed node, bytes4 indexed interfaceID, address implementer)',
  AuthorisationChanged:
    'AuthorisationChanged (bytes32 indexed node, address indexed owner, address indexed target, bool isAuthorised)',
  VersionChanged: 'VersionChanged (bytes32 indexed node, uint64 newVersion)',
}

// Type mapping for decoded data based on ENS subgraph types
const TYPE_MAPPING: Record<EventKey, Record<string, string>> = {
  Transfer: { owner: 'address' },
  NewOwner: { owner: 'address' },
  NewResolver: { resolver: 'address' },
  NewTTL: { ttl: 'uint64' },
  WrappedTransfer: { owner: 'address' },
  NameWrapped: {
    name: 'string',
    owner: 'address',
    fuses: 'uint32',
    expiryDate: 'uint64',
  },
  NameUnwrapped: { owner: 'address' },
  FusesSet: { fuses: 'uint32' },
  ExpiryExtended: { expiryDate: 'uint64' },
  NameRegistered: { registrant: 'address', expiryDate: 'uint256' },
  NameRenewed: { expiryDate: 'uint256' },
  NameTransferred: { newOwner: 'address' },
  AddrChanged: { addr: 'address' },
  MulticoinAddrChanged: { coinType: 'uint256', multiaddr: 'bytes' },
  NameChanged: { name: 'string' },
  AbiChanged: { contentType: 'uint256' },
  PubkeyChanged: { x: 'bytes32', y: 'bytes32' },
  TextChanged: { key: 'string', value: 'string' },
  ContenthashChanged: { hash: 'bytes' },
  InterfaceChanged: { interfaceID: 'bytes4', implementer: 'address' },
  AuthorisationChanged: {
    owner: 'address',
    target: 'address',
    isAuthorized: 'bool',
  },
  VersionChanged: { version: 'uint64' },
}

/**
 * Get the event signature for a given event type
 * @param eventType - The event type key (e.g., 'NameWrapped', 'AddrChanged')
 * @returns The full event signature or the event type if not found
 */
export const getEventSignature = (eventType: string): string => {
  return EVENT_SIGNATURES[eventType as EventKey] || eventType
}

/**
 * Get the Solidity type for a specific field in an event
 * @param eventType - The event type key
 * @param fieldKey - The field name
 * @returns The Solidity type or 'unknown' if not found
 */
export const getEventFieldType = (
  eventType: string,
  fieldKey: string,
): string => {
  const mapping = TYPE_MAPPING[eventType as EventKey]
  return mapping?.[fieldKey] || 'unknown'
}

/**
 * Get all field type mappings for a given event type
 * @param eventType - The event type key
 * @returns Record of field names to their Solidity types
 */
export const getEventFieldTypes = (
  eventType: string,
): Record<string, string> | undefined => {
  return TYPE_MAPPING[eventType as EventKey]
}
