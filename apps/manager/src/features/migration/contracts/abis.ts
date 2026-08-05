import {
  publicResolverMultiAddrSnippet,
  publicResolverMulticallSnippet,
  publicResolverSetAddrSnippet,
  publicResolverSetTextSnippet,
  publicResolverTextSnippet,
} from '@ensdomains/ensjs-abi/v1/publicResolver'
import { eacGrantRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import { parseAbi } from 'viem'

export { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '@ens-apps/migration'

// TODO(ensjs): upstream `getStatus(uint256) view returns (uint8)` on ETHRegistry
// to @ensdomains/ensjs-abi/v2/permissionedRegistry and drop this local snippet.
const ethRegistryGetStatusSnippet = parseAbi([
  'function getStatus(uint256 anyId) view returns (uint8)',
])

// Shared by the V1 NFT contracts and the V2 registry. Migration temporarily
// grants operator access to the HCA and later revokes only grants made by the
// current run.
export const OPERATOR_APPROVAL_ABI = parseAbi([
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
])

// TODO(ensjs): `subregistryInitializeSnippet` in
// @ensdomains/ensjs-abi/v2/verifiableFactory still declares the 2-arg
// `initialize(address, uint256)`. The deployed PermissionedResolver takes a
// third `setters` argument (a multicall batch run at init time), so encoding
// the old form yields selector 0xcd6dc687 — which the implementation no longer
// exposes, making the initializer delegatecall revert with empty data.
// Drop this once ensjs-abi carries the 3-arg form.
// See contracts-v2 `src/resolver/PermissionedResolver.sol`.
const subregistryInitializeSnippet = parseAbi([
  'function initialize(address admin, uint256 roleBitmap, bytes[] setters)',
])

export const ETH_REGISTRY_V2_ABI = [
  ...permissionedRegistryGetSubregistrySnippet,
  ...permissionedRegistryGetResolverSnippet,
  ...ethRegistryGetStatusSnippet,
  ...OPERATOR_APPROVAL_ABI,
  ...eacGrantRolesSnippet,
] as const

export const VERIFIABLE_FACTORY_ABI = verifiableFactoryDeployProxySnippet

export const PERMISSIONED_RESOLVER_ABI = [
  ...subregistryInitializeSnippet,
  ...publicResolverMulticallSnippet,
  ...publicResolverSetTextSnippet,
  ...publicResolverSetAddrSnippet,
  ...publicResolverTextSnippet,
  ...publicResolverMultiAddrSnippet,
] as const

export const BASE_REGISTRAR_DIRECT_MIGRATION_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
])

export const NAME_WRAPPER_DIRECT_MIGRATION_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)',
])

const migrationDataComponents = [
  { name: 'label', type: 'string' },
  { name: 'owner', type: 'address' },
  { name: 'subregistry', type: 'address' },
  { name: 'resolver', type: 'address' },
] as const

export const MIGRATION_DATA_ABI_PARAMETERS = [
  { name: 'data', type: 'tuple', components: migrationDataComponents },
] as const

export const MIGRATION_DATA_ARRAY_ABI_PARAMETERS = [
  { name: 'data', type: 'tuple[]', components: migrationDataComponents },
] as const

// LibMigration errors — these come back wrapped inside Error(string) due to
// NameWrapper's transfer-error squelching. decodeMigrationError unwraps and
// matches against this ABI.
export const LIB_MIGRATION_ERRORS_ABI = parseAbi([
  'error NameRequiresMigration()',
  'error NameNotLocked(uint256 tokenId)',
  'error NameIsLocked(uint256 tokenId)',
  'error NameDataMismatch(uint256 tokenId)',
  'error FrozenTokenApproval(uint256 tokenId)',
  'error InvalidData()',
])
