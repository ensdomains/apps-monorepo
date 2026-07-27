/**
 * Solidity types for the indexer's decoded event payloads, keyed by event type.
 * Field names mirror the `as*` payloads fetched by the history timeline query
 * (plus EACRolesChanged, whose canonical fields arrive via the raw data blob).
 */
const FIELD_TYPES: Record<string, Record<string, string>> = {
  AddressChanged: {
    address: 'bytes',
    coinType: 'uint256',
    resolver: 'address',
    namehash: 'bytes32',
  },
  // AddrChanged shares the asAddressChanged payload.
  AddrChanged: {
    address: 'bytes',
    coinType: 'uint256',
    resolver: 'address',
    namehash: 'bytes32',
  },
  TextChanged: {
    key: 'string',
    value: 'string',
    resolver: 'address',
    namehash: 'bytes32',
  },
  Transfer: {
    from: 'address',
    to: 'address',
    id: 'uint256',
    operator: 'address',
    value: 'uint256',
  },
  RegistryTransfer: { node: 'bytes32', owner: 'address' },
  LabelRegistered: {
    name: 'string',
    owner: 'address',
    registry: 'address',
    tokenId: 'uint256',
    sender: 'address',
    canonicalId: 'uint256',
    expiry: 'uint64',
  },
  NameRegistered: {
    name: 'string',
    label: 'bytes32',
    owner: 'address',
    cost: 'uint256',
    baseCost: 'uint256',
    premium: 'uint256',
    referrer: 'bytes32',
    expires: 'uint64',
  },
  NameRenewed: { id: 'uint256', expires: 'uint64' },
  ResolverUpdated: {
    resolver: 'address',
    sender: 'address',
    tokenId: 'uint256',
  },
  ReverseClaimed: { address: 'address', node: 'bytes32' },
  NameWrapped: {
    node: 'bytes32',
    owner: 'address',
    fuses: 'uint32',
    expiry: 'uint64',
  },
  NameUnwrapped: { node: 'bytes32', owner: 'address' },
  FusesSet: { node: 'bytes32', fuses: 'uint32' },
  ExpiryUpdated: { node: 'bytes32', tokenId: 'uint256', expiry: 'uint64' },
  EACRolesChanged: {
    resource: 'uint256',
    account: 'address',
    oldRoleBitmap: 'uint256',
    newRoleBitmap: 'uint256',
  },
}

export const getTimelineFieldType = (
  eventType: string,
  fieldKey: string,
): string => FIELD_TYPES[eventType]?.[fieldKey] ?? 'unknown'
