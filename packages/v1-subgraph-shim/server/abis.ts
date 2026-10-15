/**
 * The V1 events this shim reconstructs its world from.
 *
 * Only events, and only the ones some query actually needs — a `view` call
 * would tell us the present, and the subgraph's job is to remember the past.
 */

import { parseAbi } from 'viem'

export const REGISTRY_EVENTS = parseAbi([
  'event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner)',
  'event Transfer(bytes32 indexed node, address owner)',
  'event NewResolver(bytes32 indexed node, address resolver)',
  'event NewTTL(bytes32 indexed node, uint64 ttl)',
])

export const REGISTRAR_EVENTS = parseAbi([
  'event NameRegistered(uint256 indexed id, address indexed owner, uint256 expires)',
  'event NameRenewed(uint256 indexed id, uint256 expires)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
])

/**
 * The controller's registration event, which is the only place a `.eth` 2LD's
 * plaintext label appears on chain. Everything else carries the labelhash, and
 * a hash cannot be reversed — which is why the real subgraph needs a rainbow
 * table and why it prints `[<labelhash>]` when it has no entry.
 */
export const CONTROLLER_EVENTS = parseAbi([
  'event NameRegistered(string name, bytes32 indexed label, address indexed owner, uint256 baseCost, uint256 premium, uint256 expires)',
  'event NameRenewed(string name, bytes32 indexed label, uint256 cost, uint256 expires)',
])

/**
 * `NameWrapped` carries the DNS-encoded FULL name, so every wrapped node —
 * including subnames at any depth — recovers its own label from its own event.
 * That is what makes a locally-seeded wrapped subname nameable here at all.
 */
export const WRAPPER_EVENTS = parseAbi([
  'event NameWrapped(bytes32 indexed node, bytes name, address owner, uint32 fuses, uint64 expiry)',
  'event NameUnwrapped(bytes32 indexed node, address owner)',
  'event FusesSet(bytes32 indexed node, uint32 fuses)',
  'event ExpiryExtended(bytes32 indexed node, uint64 expiry)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
])

export const RESOLVER_EVENTS = parseAbi([
  'event AddrChanged(bytes32 indexed node, address a)',
  'event AddressChanged(bytes32 indexed node, uint256 coinType, bytes newAddress)',
  'event NameChanged(bytes32 indexed node, string name)',
  'event TextChanged(bytes32 indexed node, string indexed indexedKey, string key, string value)',
  'event ContenthashChanged(bytes32 indexed node, bytes hash)',
  'event ABIChanged(bytes32 indexed node, uint256 indexed contentType)',
])
