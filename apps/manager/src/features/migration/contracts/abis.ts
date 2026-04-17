import { parseAbi } from 'viem'

export const BASE_REGISTRAR_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
])

export const NAME_WRAPPER_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
  'function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)',
  'function getApproved(uint256 id) view returns (address)',
])

export const ETH_REGISTRY_V2_ABI = parseAbi([
  'function getSubregistry(string label) view returns (address)',
  'function getResolver(string label) view returns (address)',
  'function getStatus(uint256 anyId) view returns (uint8)',
  'function grantRoles(uint256 resource, uint256 roleBitmap, address account) returns (bool)',
])

export const PRE_MIGRATION_ABI = parseAbi([
  'function preMigrate(string label, uint64 expiry, address registry, address resolver)',
])

export const WRAPPER_REGISTRY_ABI = parseAbi([
  'function getSubregistry(string label) view returns (address)',
])

export const VERIFIABLE_FACTORY_ABI = parseAbi([
  'function deployProxy(address implementation, uint256 salt, bytes data)',
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
])

export const PERMISSIONED_RESOLVER_ABI = parseAbi([
  'function initialize(address admin, uint256 roleBitmap)',
  'function multicall(bytes[] data) returns (bytes[] results)',
  'function setText(bytes32 node, string key, string value)',
  'function setAddr(bytes32 node, uint256 coinType, bytes value)',
  'function text(bytes32 node, string key) view returns (string)',
  'function addr(bytes32 node, uint256 coinType) view returns (bytes)',
])
