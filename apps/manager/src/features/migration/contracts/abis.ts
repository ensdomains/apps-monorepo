import { parseAbi } from 'viem'

/**
 * BaseRegistrar (ERC-721) ABI snippet for migration.
 * Only includes the 4-arg safeTransferFrom (with data bytes) used for unwrapped name migration.
 */
export const BASE_REGISTRAR_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function getApproved(uint256 tokenId) view returns (address)',
])

/**
 * NameWrapper (ERC-1155) ABI snippet for migration.
 * Includes single and batch transfer, approval check, data read, and approval read.
 */
export const NAME_WRAPPER_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)',
  'function getApproved(uint256 id) view returns (address)',
])

/**
 * ETHRegistry v2 ABI snippet for reading subregistry addresses.
 * Used to look up WrapperRegistry addresses for locked child (3LD+) migration.
 */
export const ETH_REGISTRY_V2_ABI = parseAbi([
  'function getSubregistry(string label) view returns (address)',
  'function getResolver(string label) view returns (address)',
])

/**
 * WrapperRegistry ABI snippet for reading subregistry addresses of migrated locked names.
 * Used for deep (4LD+) child migration where the parent is a 3LD.
 */
export const WRAPPER_REGISTRY_ABI = parseAbi([
  'function getSubregistry(string label) view returns (address)',
  'function getWrappedNode() view returns (bytes32)',
  'function getWrappedName() view returns (bytes)',
])
