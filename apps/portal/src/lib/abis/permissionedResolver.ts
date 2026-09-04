import { parseAbi } from 'viem'

/**
 * ABI of the post-audit-2 `PermissionedResolver` (contracts-v2 PR #417).
 *
 * Setters take the DNS-encoded name, not a `bytes32` node. Records are
 * internal inodes: a write creates one and links the name to it, `linkToNode`
 * / `linkToRecord` re-point a name, `linkToRecord(name, 0)` unlinks. Roles are
 * root-scoped (`grantRootRoles`) or argument-scoped (`grantSetterRoles`); per
 * name grants no longer exist.
 *
 * Local because `@ensdomains/ensjs` still ships the pre-refactor ABI.
 */
export const permissionedResolverAbi = parseAbi([
  // Setters
  'function setABI(bytes name, uint256 contentType, bytes data)',
  'function setAddress(bytes name, uint256 coinType, bytes addressBytes)',
  'function setContenthash(bytes name, bytes hash)',
  'function setData(bytes name, string key, bytes value)',
  'function setInterface(bytes name, bytes4 interfaceId, address implementer)',
  'function setName(bytes name, string primaryName)',
  'function setText(bytes name, string key, string value)',
  'function multicall(bytes[] data) returns (bytes[])',
  // Links
  'function linkToNode(bytes sourceName, bytes32 targetNode)',
  'function linkToRecord(bytes sourceName, uint256 recordId)',
  'function getRecordId(bytes32 node) view returns (uint256)',
  'function getRecordCount() view returns (uint256)',
  // Permissions (EnhancedAccessControl + setter scoping)
  'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
  'function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)',
  'function revokeRoles(uint256 resource, uint256 roleBitmap, address account) returns (bool)',
  'function grantSetterRoles(bytes setter, address account) returns (bool)',
  'function decodeSetter(bytes setter) pure returns (bytes arg, uint256 resource, uint256 roleBitmap)',
  'function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)',
  'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)',
  'function roles(uint256 resource, address account) view returns (uint256)',
  'function roleCount(uint256 resource) view returns (uint256)',
  // Lifecycle
  'struct Grant { address account; uint256 roleBitmap; }',
  'function initialize(Grant[] grants, bytes[] calls)',
  'function resolve(bytes name, bytes data) view returns (bytes)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  // Events
  'event ResolverCreated()',
  'event Linked(uint256 indexed recordId, bytes32 indexed node, bytes name)',
  'event Cleared(uint256 indexed recordId)',
  'event AddressUpdated(uint256 indexed recordId, uint256 coinType, bytes addressBytes)',
  'event TextUpdated(uint256 indexed recordId, string indexed keyHash, string key, string value)',
  'event DataUpdated(uint256 indexed recordId, string indexed keyHash, string key, bytes value)',
  'event ABIUpdated(uint256 indexed recordId, uint256 indexed contentType)',
  'event ContenthashUpdated(uint256 indexed recordId, bytes hash)',
  'event InterfaceUpdated(uint256 indexed recordId, bytes4 indexed interfaceId, address implementer)',
  'event NameUpdated(uint256 indexed recordId, string primaryName)',
  'event ResourceArgument(uint256 indexed resource, bytes arg)',
  // Errors
  'error InvalidRecord()',
  'error UnsupportedResolverProfile(bytes4 selector)',
  'error InvalidEVMAddress(bytes addressBytes)',
  'error InvalidContentType(uint256 contentType)',
])

/** `IPermissionedResolver` ERC-165 id (post-audit-2). */
export const PERMISSIONED_RESOLVER_INTERFACE_ID = '0x8c2427cc' as const
