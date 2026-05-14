import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
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
import {
  subregistryInitializeSnippet,
  verifiableFactoryDeployProxySnippet,
} from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import { erc721Abi, erc1155Abi, parseAbi } from 'viem'

export const BASE_REGISTRAR_ABI = erc721Abi

// TODO(ensjs): upstream `getApproved(uint256) view returns (address)` on NameWrapper
// to @ensdomains/ensjs-abi/v1/nameWrapper and drop this local snippet.
const nameWrapperGetApprovedSnippet = parseAbi([
  'function getApproved(uint256 id) view returns (address)',
])

export const NAME_WRAPPER_ABI = [
  ...erc1155Abi,
  ...nameWrapperGetDataSnippet,
  ...nameWrapperGetApprovedSnippet,
] as const

// TODO(ensjs): upstream `getStatus(uint256) view returns (uint8)` on ETHRegistry
// to @ensdomains/ensjs-abi/v2/permissionedRegistry and drop this local snippet.
const ethRegistryGetStatusSnippet = parseAbi([
  'function getStatus(uint256 anyId) view returns (uint8)',
])

export const ETH_REGISTRY_V2_ABI = [
  ...permissionedRegistryGetSubregistrySnippet,
  ...permissionedRegistryGetResolverSnippet,
  ...ethRegistryGetStatusSnippet,
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

// MigrationHelper — single entrypoint plus typed errors raised directly by the helper.
export const MIGRATION_HELPER_ABI = parseAbi([
  'struct Data { string label; address owner; address subregistry; address resolver; }',
  'struct LockedChildren { bytes parentName; Data[][] groups; }',
  'function migrate(Data[] unwrapped, Data[][] unlockedGroups, Data[][] lockedGroups, LockedChildren[] lockedChildrenGroups)',
  'error WrappedOwnerMismatch(uint256 tokenId)',
  'error ParentNotMigrated(bytes name)',
  'error NotApprovedOperator(address nft, address owner)',
])

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
