import { parseAbi } from 'viem'

export const BASE_REGISTRAR_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function getApproved(uint256 tokenId) view returns (address)',
])

export const NAME_WRAPPER_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)',
  'function getApproved(uint256 id) view returns (address)',
])

export const ETH_REGISTRY_V2_ABI = parseAbi([
  'function getSubregistry(string label) view returns (address)',
  'function getResolver(string label) view returns (address)',
])

export const WRAPPER_REGISTRY_ABI = parseAbi([
  'function getSubregistry(string label) view returns (address)',
  'function getWrappedNode() view returns (bytes32)',
  'function getWrappedName() view returns (bytes)',
])
