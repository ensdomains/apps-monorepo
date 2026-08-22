import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import { erc721Abi, erc1155Abi, parseAbi } from 'viem'

export const BASE_REGISTRAR_ABI = erc721Abi

// TODO(ensjs): upstream `getApproved(uint256) view returns (address)` on NameWrapper
// to @ensdomains/ensjs-abi/v1/nameWrapper and drop this local snippet.
const nameWrapperGetApprovedSnippet = parseAbi([
  'function getApproved(uint256 id) view returns (address)',
])

/**
 * ENSv1 legacy `ENSRegistry`. `owner(node)` is the live "manager" (controller) of a name —
 * the delegate allowed to set its resolver. The registrant can revoke it at any time via
 * `BaseRegistrar.reclaim`, so it is the only authoritative source for who holds the role
 * *now*; the V1 subgraph reports whoever held it when it last indexed.
 */
export const ENS_REGISTRY_V1_ABI = parseAbi([
  'function owner(bytes32 node) view returns (address)',
])

export const NAME_WRAPPER_ABI = [
  ...erc1155Abi,
  ...nameWrapperGetDataSnippet,
  ...nameWrapperGetApprovedSnippet,
] as const
