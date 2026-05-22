import type {
  DomainEventKey,
  RegistrationEventKey,
  ResolverEventKey,
} from '@ensdomains/ensjs/subgraph'

type EventKey = DomainEventKey | RegistrationEventKey | ResolverEventKey

// Event signatures mapping based on ENS subgraph types
const EVENT_SIGNATURES = {
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
} as const satisfies Record<EventKey, string>

// Resolver indexer event types (not part of the ensjs subgraph types)
const RESOLVER_INDEXER_EVENT_SIGNATURES: Record<string, string> = {
  AddressChanged:
    'AddressChanged (bytes32 indexed node, uint256 coinType, bytes newAddress)',
  ABIChanged: 'ABIChanged (bytes32 indexed node, uint256 indexed contentType)',
  AliasChanged: 'AliasChanged (bytes32 indexed node, bytes alias)',
  EACRolesChanged:
    'EACRolesChanged (uint256 resource, address account, uint256 oldRoleBitmap, uint256 newRoleBitmap)',
  // ENSv2 user-registry / permissioned-resolver events
  ResolverUpdated:
    'ResolverUpdated (uint256 indexed tokenId, address indexed resolver, address indexed sender)',
  LabelRegistered:
    'LabelRegistered (uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)',
  LabelReserved:
    'LabelReserved (uint256 indexed tokenId, bytes32 indexed labelHash, string label, uint64 expiry, address indexed sender)',
  LabelUnregistered:
    'LabelUnregistered (uint256 indexed tokenId, address indexed sender)',
  ExpiryUpdated:
    'ExpiryUpdated (uint256 indexed tokenId, uint64 indexed newExpiry, address indexed sender)',
  ParentUpdated:
    'ParentUpdated (address indexed parent, string label, address indexed sender)',
  SubregistryUpdated:
    'SubregistryUpdated (uint256 indexed tokenId, address indexed subregistry, address indexed sender)',
  TokenResource:
    'TokenResource (uint256 indexed tokenId, uint256 indexed resource)',
  Upgraded: 'Upgraded (address indexed implementation)',
}

// Type mapping for decoded data based on ENS subgraph types
const TYPE_MAPPING = {
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
} as const satisfies Record<EventKey, Record<string, string>>

const RESOLVER_INDEXER_TYPE_MAPPING: Record<string, Record<string, string>> = {
  AddressChanged: {
    namehash: 'bytes32',
    coinType: 'uint256',
    address: 'bytes',
  },
  ABIChanged: { namehash: 'bytes32', contentType: 'uint256' },
  AliasChanged: { namehash: 'bytes32', alias: 'bytes' },
  EACRolesChanged: {
    resource: 'uint256',
    account: 'address',
    oldRoleBitmap: 'uint256',
    newRoleBitmap: 'uint256',
  },
  // ENSv2 user-registry / permissioned-resolver events
  ResolverUpdated: {
    tokenId: 'uint256',
    resolver: 'address',
    sender: 'address',
  },
  LabelRegistered: {
    tokenId: 'uint256',
    labelHash: 'bytes32',
    label: 'string',
    owner: 'address',
    expiry: 'uint64',
    sender: 'address',
  },
  LabelReserved: {
    tokenId: 'uint256',
    labelHash: 'bytes32',
    label: 'string',
    expiry: 'uint64',
    sender: 'address',
  },
  LabelUnregistered: {
    tokenId: 'uint256',
    sender: 'address',
  },
  ExpiryUpdated: {
    tokenId: 'uint256',
    newExpiry: 'uint64',
    sender: 'address',
  },
  ParentUpdated: {
    parent: 'address',
    label: 'string',
    sender: 'address',
  },
  SubregistryUpdated: {
    tokenId: 'uint256',
    subregistry: 'address',
    sender: 'address',
  },
  TokenResource: {
    tokenId: 'uint256',
    resource: 'uint256',
  },
  Upgraded: {
    implementation: 'address',
  },
}

type EventFieldTypes<T extends EventKey> = (typeof TYPE_MAPPING)[T]

function isEventKey(k: string): k is EventKey {
  return k in TYPE_MAPPING
}

/**
 * Get the event signature for a given event type
 * @param eventType - The event type key (e.g., 'NameWrapped', 'AddrChanged')
 * @returns The full event signature or the event type if not found
 */
export function getEventSignature<T extends EventKey>(
  eventType: T,
): (typeof EVENT_SIGNATURES)[T]
export function getEventSignature(eventType: string): string
export function getEventSignature(eventType: EventKey | string): string {
  if (isEventKey(eventType)) return EVENT_SIGNATURES[eventType]
  return RESOLVER_INDEXER_EVENT_SIGNATURES[eventType] ?? eventType
}

/**
 * Get the Solidity type for a specific field in an event
 * @param eventType - The event type key
 * @param fieldKey - The field name
 * @returns The Solidity type or 'unknown' if not found
 */
export function getEventFieldType<
  T extends EventKey,
  K extends keyof EventFieldTypes<T>,
>(eventType: T, fieldKey: K): EventFieldTypes<T>[K]
export function getEventFieldType(eventType: string, fieldKey: string): string
export function getEventFieldType(
  eventType: EventKey | string,
  fieldKey: string,
): string {
  if (isEventKey(eventType)) {
    const mapping = TYPE_MAPPING[eventType] as Record<string, string>
    return mapping[fieldKey] ?? 'unknown'
  }
  const resolverMapping = RESOLVER_INDEXER_TYPE_MAPPING[eventType]
  return resolverMapping?.[fieldKey] ?? 'unknown'
}
