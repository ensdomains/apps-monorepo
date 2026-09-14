import {
  publicResolverAbiSnippet,
  publicResolverContenthashSnippet,
  publicResolverMultiAddrSnippet,
  publicResolverTextSnippet,
} from '@ensdomains/ensjs-abi/v1/publicResolver'
import { eacGrantRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { migrationHelperMigrateSnippet } from '@ensdomains/ensjs-abi/v2/migrationHelper'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import {
  permissionedResolverInitializeSnippet,
  permissionedResolverLinkToRecordSnippet,
  permissionedResolverMulticallSnippet,
  permissionedResolverSetAbiSnippet,
  permissionedResolverSetAddressSnippet,
  permissionedResolverSetContenthashSnippet,
  permissionedResolverSetTextSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import { parseAbi } from 'viem'

export { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '@ens-apps/migration'

// TODO(ensjs): upstream `getStatus(uint256) view returns (uint8)` on ETHRegistry
// to @ensdomains/ensjs-abi/v2/permissionedRegistry and drop this local snippet.
const ethRegistryGetStatusSnippet = parseAbi([
  'function getStatus(uint256 anyId) view returns (uint8)',
])

// Shared by the V1 NFT contracts and the V2 registry. Migration grants the
// wallet-owned HCA operator access that can be reused for later operations.
export const OPERATOR_APPROVAL_ABI = parseAbi([
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
])

export const ETH_REGISTRY_V2_ABI = [
  ...permissionedRegistryGetSubregistrySnippet,
  ...permissionedRegistryGetResolverSnippet,
  ...ethRegistryGetStatusSnippet,
  ...OPERATOR_APPROVAL_ABI,
  ...eacGrantRolesSnippet,
] as const

export const VERIFIABLE_FACTORY_ABI = verifiableFactoryDeployProxySnippet

/**
 * Profile getters on a **V1** resolver, for reading the records a name has
 * before migration. Keyed by `bytes32 node`, which is correct here: these are
 * only ever called against `v1ResolverAddress`.
 */
export const V1_RESOLVER_PROFILE_ABI = [
  ...publicResolverTextSnippet,
  ...publicResolverMultiAddrSnippet,
  ...publicResolverContenthashSnippet,
  ...publicResolverAbiSnippet,
] as const

/**
 * The **V2** `PermissionedResolver` write surface: deploy-time initializer plus
 * the record setters the migration replays into.
 *
 * The setters take the DNS-encoded name, not `bytes32 node`, and `setAddr` is
 * renamed `setAddress`, so the v1 encodings hit the resolver's fallback and
 * revert with empty data. `linkToRecord(name, 0)` unlinks a name, which is what
 * replaced `clearRecords`.
 */
export const PERMISSIONED_RESOLVER_ABI = [
  ...permissionedResolverInitializeSnippet,
  ...permissionedResolverMulticallSnippet,
  ...permissionedResolverSetTextSnippet,
  ...permissionedResolverSetAddressSnippet,
  ...permissionedResolverSetContenthashSnippet,
  ...permissionedResolverSetAbiSnippet,
  ...permissionedResolverLinkToRecordSnippet,
] as const

export const MIGRATION_HELPER_ABI = migrationHelperMigrateSnippet

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
