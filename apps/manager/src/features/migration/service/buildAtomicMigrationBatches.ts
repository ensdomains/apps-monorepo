import {
  buildHcaOwnerExecutionCall,
  computeResolverAddress,
  computeResolverSalt,
  getDestinationContracts,
  ROLES_ALL,
} from '@ens-apps/smart-account'
import type { Call } from '@ens-apps/transaction-manager'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { permissionedResolverAuthorizeNameRolesSnippet } from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  isAddressEqual,
  namehash,
  zeroAddress,
} from 'viem'

import { PERMISSIONED_RESOLVER_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import {
  buildMigrationHelperCall,
  type MigrationHelperNameInput,
} from './buildMigrationHelperCall'
import {
  flattenProfileInnerCalls,
  wrapInnerCallsAsMulticall,
} from './buildProfileReplayCalls'
import { buildRoleGrantCall } from './buildRoleGrantCalls'
import {
  type ClassifiedName,
  type DirectClassifiedName,
  FUSES,
  hasFuse,
} from './classifyNames'
import {
  type DirectMigrationRoute,
  orderDirectMigrationNamesParentFirst,
} from './directMigrationRoutes'
import {
  createMigrationData,
  type MigrationData,
  resolverFor,
} from './encodeMigration'
import type { Profile } from './fetchV1Profiles'
import { profileMapKey } from './fetchV1Profiles'
import {
  buildRegisterCopiedSubnameCall,
  buildUserRegistrySetupCalls,
  computeUserRegistryAddress,
  computeUserRegistrySalt,
} from './userRegistryMigration'

const ROOT_NAME = '0x00' as const
const ROOT_RESOURCE = 0n
const ROLE_REGISTRAR = 1n << 0n
const ROLE_RENEW = 1n << 16n
const ROLE_SET_RESOLVER = 1n << 24n
const ROLE_CAN_NAME = 1n << 120n
const ROLE_UPGRADE = 1n << 124n
const ROLE_CAN_TRANSFER_ADMIN = 1n << 156n

export type AtomicMigrationExecutionPhase =
  | 'resolver-deployment'
  | 'wallet-co-admin-grant'
  | 'user-registry-deployment'
  | 'user-registry-wallet-grant'
  | 'user-registry-parent'
  | 'migrate'
  | 'copy-register'
  | 'manager-role-grant'
  | 'profile-replay'

export type AtomicMigrationInnerExecution = {
  readonly phase: AtomicMigrationExecutionPhase
  /** First name, retained for single-name UI/profile accounting. */
  readonly name: string
  /** Every name included by this call (multiple for ERC-1155 batches). */
  readonly names: readonly string[]
  readonly call: Call
}

export type AtomicMigrationRegistryPath =
  | {
      readonly type: 'eth-registry-2ld'
      readonly registry: Address
      readonly label: string
      readonly resource: bigint
    }
  | {
      readonly type: 'parent-subregistry'
      readonly rootRegistry: Address
      readonly parentName: string
      readonly label: string
      readonly resource: bigint
    }

type ResolverImplementationExpectation = {
  readonly id: string
  readonly type: 'resolver-implementation'
  readonly name: string
  readonly resolver: Address
  readonly factory: Address
  readonly expectedImplementation: Address
  readonly deployer: Address
  readonly salt: bigint
}

type ResolverRootRolesExpectation = {
  readonly id: string
  readonly type: 'resolver-root-roles'
  readonly name: string
  readonly resolver: Address
  readonly account: Address
  readonly rootName: Hex
  readonly roleBitmap: bigint
}

type WalletNameRolesExpectation = {
  readonly id: string
  readonly type: 'wallet-name-roles'
  readonly name: string
  readonly resolver: Address
  readonly account: Address
  readonly rootName: Hex
  readonly roleBitmap: bigint
}

type NameOwnerExpectation = {
  readonly id: string
  readonly type: 'name-owner'
  readonly name: string
  readonly label: string
  readonly node: Hex
  readonly resource: bigint
  readonly tokenType: ClassifiedName['tokenType']
  readonly registryPath: AtomicMigrationRegistryPath
  readonly expectedOwner: Address
}

type NameResolverExpectation = {
  readonly id: string
  readonly type: 'name-resolver'
  readonly name: string
  readonly label: string
  readonly node: Hex
  readonly resource: bigint
  readonly registryPath: AtomicMigrationRegistryPath
  readonly expectedResolver: Address
}

type NameOwnerRolesExpectation = {
  readonly id: string
  readonly type: 'name-owner-roles'
  readonly name: string
  readonly registryPath: AtomicMigrationRegistryPath
  readonly resource: bigint
  readonly account: Address
  readonly roleBitmap: bigint
}

type WrapperSubregistryExpectation = {
  readonly id: string
  readonly type: 'wrapper-subregistry'
  readonly name: string
  readonly node: Hex
  readonly label: string
  readonly registryPath: AtomicMigrationRegistryPath
  readonly factory: Address
  readonly expectedImplementation: Address
  readonly expectedWrapperRegistry: Address
}

type WrapperRootRolesExpectation = {
  readonly id: string
  readonly type: 'wrapper-root-roles'
  readonly name: string
  readonly label: string
  readonly registryPath: AtomicMigrationRegistryPath
  readonly resource: typeof ROOT_RESOURCE
  readonly account: Address
  readonly roleBitmap: bigint
}

type UserRegistryImplementationExpectation = {
  readonly id: string
  readonly type: 'user-registry-implementation'
  readonly name: string
  readonly registry: Address
  readonly factory: Address
  readonly expectedImplementation: Address
  readonly deployer: Address
  readonly salt: bigint
}

type UserRegistryRootRolesExpectation = {
  readonly id: string
  readonly type: 'user-registry-root-roles'
  readonly name: string
  readonly registry: Address
  readonly account: Address
  readonly roleBitmap: bigint
}

type UserRegistryParentExpectation = {
  readonly id: string
  readonly type: 'user-registry-parent'
  readonly name: string
  readonly registry: Address
  readonly expectedParentRegistry: Address
  readonly expectedParentLabel: string
}

type NameSubregistryExpectation = {
  readonly id: string
  readonly type: 'name-subregistry'
  readonly name: string
  readonly label: string
  readonly registryPath: AtomicMigrationRegistryPath
  readonly expectedSubregistry: Address
}

type NameExpiryExpectation = {
  readonly id: string
  readonly type: 'name-expiry'
  readonly name: string
  readonly registryPath: AtomicMigrationRegistryPath
  readonly resource: bigint
  readonly expectedExpiry: bigint
}

type ManagerRoleExpectation = {
  readonly id: string
  readonly type: 'manager-role'
  readonly name: string
  readonly label: string
  readonly registry: Address
  readonly resource: bigint
  readonly account: Address
  readonly roleBitmap: bigint
}

type ProfileTextExpectation = {
  readonly id: string
  readonly type: 'profile-text'
  readonly name: string
  readonly node: Hex
  readonly resolver: Address
  readonly key: string
  readonly value: string
}

type ProfileAddressExpectation = {
  readonly id: string
  readonly type: 'profile-address'
  readonly name: string
  readonly node: Hex
  readonly resolver: Address
  readonly coinType: bigint
  readonly value: Hex
}

type ProfileContenthashExpectation = {
  readonly id: string
  readonly type: 'profile-contenthash'
  readonly name: string
  readonly node: Hex
  readonly resolver: Address
  readonly value: Hex
}

type ProfileAbiExpectation = {
  readonly id: string
  readonly type: 'profile-abi'
  readonly name: string
  readonly node: Hex
  readonly resolver: Address
  readonly contentType: bigint
  readonly value: Hex
}

export type AtomicMigrationVerificationExpectation =
  | ResolverImplementationExpectation
  | ResolverRootRolesExpectation
  | WalletNameRolesExpectation
  | NameOwnerExpectation
  | NameResolverExpectation
  | NameOwnerRolesExpectation
  | WrapperSubregistryExpectation
  | WrapperRootRolesExpectation
  | UserRegistryImplementationExpectation
  | UserRegistryRootRolesExpectation
  | UserRegistryParentExpectation
  | NameSubregistryExpectation
  | NameExpiryExpectation
  | ManagerRoleExpectation
  | ProfileTextExpectation
  | ProfileAddressExpectation
  | ProfileContenthashExpectation
  | ProfileAbiExpectation

export type AtomicMigrationNameExecution = {
  readonly classified: ClassifiedName
  readonly directRoute: DirectMigrationRoute | null
  readonly migrationData: MigrationData | null
  readonly innerExecutions: readonly AtomicMigrationInnerExecution[]
  readonly verificationExpectations: readonly AtomicMigrationVerificationExpectation[]
}

export type AtomicMigrationBatch = {
  readonly index: number
  readonly names: readonly string[]
  readonly operations: readonly {
    readonly name: string
    readonly action: ClassifiedName['action']
  }[]
  readonly nameExecutions: readonly AtomicMigrationNameExecution[]
  readonly innerExecutions: readonly AtomicMigrationInnerExecution[]
  readonly outerCall: Call
  readonly estimatedGas: bigint
  readonly verificationExpectations: readonly AtomicMigrationVerificationExpectation[]
}

export type AtomicMigrationBatchPlan = {
  readonly resolver: Address
  readonly batches: readonly AtomicMigrationBatch[]
}

export type AtomicMigrationOuterGasEstimateRequest = {
  readonly call: Call
  readonly names: readonly string[]
  readonly innerExecutions: readonly AtomicMigrationInnerExecution[]
}

export type EstimateAtomicMigrationOuterGas = (
  request: AtomicMigrationOuterGasEstimateRequest,
) => bigint | Promise<bigint>

export class AtomicMigrationNameGasLimitExceededError extends Error {
  readonly ensName: string
  readonly estimatedGas: bigint
  readonly maxOuterGas: bigint

  constructor(params: {
    readonly ensName: string
    readonly estimatedGas: bigint
    readonly maxOuterGas: bigint
  }) {
    super(
      `Atomic migration for "${params.ensName}" estimated at ${params.estimatedGas} gas; exceeds outer executeByOwner limit ${params.maxOuterGas}`,
    )
    this.name = 'AtomicMigrationNameGasLimitExceededError'
    this.ensName = params.ensName
    this.estimatedGas = params.estimatedGas
    this.maxOuterGas = params.maxOuterGas
  }
}

export type BuildAtomicMigrationBatchesParams = {
  readonly chainId: number
  readonly hca: Address
  readonly wallet: Address
  readonly classified: readonly ClassifiedName[]
  /** Full selected tree retained while execution removes completed nodes. */
  readonly registryContext?: readonly ClassifiedName[]
  readonly directRoutes: ReadonlyMap<string, DirectMigrationRoute>
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly defaultResolver?: Address
  readonly resolverDeployed: boolean
  readonly walletCoAdminGranted: boolean
  readonly maxOuterGas: bigint
  readonly estimateOuterGas: EstimateAtomicMigrationOuterGas
  /** Execution only: return once the leading executable batch is known. */
  readonly firstBatchOnly?: boolean
  /** Preview-derived leading batch size used to seed live gas discovery. */
  readonly initialBatchSize?: number
}

const expectationId = (
  name: string,
  expectation: AtomicMigrationVerificationExpectation['type'],
  detail?: string,
): string => `${name}:${expectation}${detail ? `:${detail}` : ''}`

const registryPathFor = (name: ClassifiedName): AtomicMigrationRegistryPath => {
  const resource = labelToCanonicalId(name.label)
  const is2ld =
    name.tokenType === 'unwrapped' ||
    name.tokenType === 'unlocked' ||
    name.tokenType === 'locked-2ld'

  if (is2ld) {
    return {
      type: 'eth-registry-2ld',
      registry: V2_CONTRACTS.ETHRegistry,
      label: name.label,
      resource,
    }
  }

  if (!name.parentName) {
    throw new Error(
      `Cannot build verification registry path for "${name.domain.name}" without a parent`,
    )
  }

  return {
    type: 'parent-subregistry',
    rootRegistry: V2_CONTRACTS.ETHRegistry,
    parentName: name.parentName,
    label: name.label,
    resource,
  }
}

const isLockedName = (name: ClassifiedName): name is DirectClassifiedName =>
  name.action === 'migrate' &&
  (name.tokenType === 'locked-2ld' || name.tokenType === 'locked-child')

const orderPlannedNamesParentFirst = (
  names: readonly ClassifiedName[],
): readonly ClassifiedName[] => {
  const byName = new Map<string, ClassifiedName>()
  for (const name of names) {
    if (byName.has(name.domain.name)) {
      throw new Error(
        `Migration selection contains duplicate name "${name.domain.name}"`,
      )
    }
    byName.set(name.domain.name, name)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const ordered: ClassifiedName[] = []

  const visit = (name: ClassifiedName): void => {
    const ensName = name.domain.name
    if (visited.has(ensName)) return
    if (visiting.has(ensName)) {
      throw new Error(`Migration selection contains a cycle at "${ensName}"`)
    }
    visiting.add(ensName)
    if (name.parentName) {
      const parent = byName.get(name.parentName)
      if (parent) visit(parent)
    }
    visiting.delete(ensName)
    visited.add(ensName)
    ordered.push(name)
  }

  for (const name of names) visit(name)
  return ordered
}

const buildUserRegistryAddresses = (params: {
  readonly hca: Address
  readonly registryContext: readonly ClassifiedName[]
}): ReadonlyMap<string, Address> => {
  const parentNames = new Set(
    params.registryContext.flatMap((name) =>
      name.action === 'copy' && name.parentName ? [name.parentName] : [],
    ),
  )
  return new Map(
    [...parentNames].map((parentName) => [
      parentName,
      computeUserRegistryAddress({ hca: params.hca, parentName }),
    ]),
  )
}

const parentRegistryFor = (params: {
  readonly name: ClassifiedName
  readonly userRegistries: ReadonlyMap<string, Address>
}): Address => {
  if (params.name.parentName === 'eth') return V2_CONTRACTS.ETHRegistry
  if (!params.name.parentName) {
    throw new Error(
      `Cannot locate parent registry for "${params.name.domain.name}"`,
    )
  }
  const registry = params.userRegistries.get(params.name.parentName)
  if (!registry) {
    throw new Error(
      `No UserRegistry planned for parent "${params.name.parentName}"`,
    )
  }
  return registry
}

/** Mirrors LockedWrapperReceiver._tokenRoleBitmapFromFuses(). */
export const lockedNameOwnerRoleBitmap = (fuses: bigint): bigint => {
  let roleBitmap = 0n
  if (hasFuse(fuses, FUSES.CAN_EXTEND_EXPIRY)) {
    roleBitmap |= ROLE_RENEW
  }
  if (!hasFuse(fuses, FUSES.CANNOT_SET_RESOLVER)) {
    roleBitmap |= ROLE_SET_RESOLVER
  }
  if (!hasFuse(fuses, FUSES.CANNOT_BURN_FUSES)) {
    roleBitmap |= roleBitmap << 128n
  }
  if (!hasFuse(fuses, FUSES.CANNOT_TRANSFER)) {
    roleBitmap |= ROLE_CAN_TRANSFER_ADMIN
  }
  return roleBitmap
}

/** Mirrors LockedWrapperReceiver._subregistryRoleBitmapFromFuses(). */
export const lockedWrapperRootRoleBitmap = (fuses: bigint): bigint => {
  let roleBitmap = ROLE_RENEW | ROLE_UPGRADE | ROLE_CAN_NAME
  if (!hasFuse(fuses, FUSES.CANNOT_CREATE_SUBDOMAIN)) {
    roleBitmap |= ROLE_REGISTRAR
  }
  if (!hasFuse(fuses, FUSES.CANNOT_BURN_FUSES)) {
    roleBitmap |= roleBitmap << 128n
  }
  return roleBitmap
}

const buildResolverDeploymentCall = (params: {
  readonly chainId: number
  readonly hca: Address
}): Call => {
  const contracts = getDestinationContracts(params.chainId)
  const initializeData = encodeFunctionData({
    abi: PERMISSIONED_RESOLVER_ABI,
    functionName: 'initialize',
    args: [[{ account: params.hca, roleBitmap: ROLES_ALL }], []],
  })

  return {
    to: contracts.verifiableFactory,
    data: encodeFunctionData({
      abi: verifiableFactoryDeployProxySnippet,
      functionName: 'deployProxy',
      args: [
        contracts.permissionedResolverImpl,
        computeResolverSalt(params.hca),
        initializeData,
      ],
    }),
    value: 0n,
  }
}

const buildWalletCoAdminCall = (params: {
  readonly resolver: Address
  readonly wallet: Address
}): Call => ({
  to: params.resolver,
  data: encodeFunctionData({
    abi: permissionedResolverAuthorizeNameRolesSnippet,
    functionName: 'authorizeNameRoles',
    args: [ROOT_NAME, ROLES_ALL, params.wallet, true],
  }),
  value: 0n,
})

const profileForName = (
  name: ClassifiedName,
  profiles: ReadonlyMap<Hex, Profile>,
): { readonly node: Hex; readonly profile: Profile } | null => {
  if (name.resolverStrategy !== 'to-owned-permres') return null

  const node = namehash(name.domain.name) as Hex
  const profile = profiles.get(profileMapKey(node))
  if (!profile) return null

  const hasRecords =
    profile.texts.length > 0 ||
    profile.addresses.length > 0 ||
    profile.contentHash !== null ||
    profile.abis.length > 0
  return hasRecords ? { node, profile } : null
}

type BuildNameExecutionParams = {
  readonly chainId: number
  readonly hca: Address
  readonly wallet: Address
  readonly classified: ClassifiedName
  readonly directRoute: DirectMigrationRoute | null
  readonly userRegistries: ReadonlyMap<string, Address>
  readonly resolver: Address
  readonly defaultResolver: Address
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly includeResolverVerification: boolean
  readonly includeResolverDeployment: boolean
  readonly includeWalletCoAdminGrant: boolean
}

type NameExecutionFragment = {
  readonly innerExecutions: readonly AtomicMigrationInnerExecution[]
  readonly verificationExpectations: readonly AtomicMigrationVerificationExpectation[]
}

const EMPTY_NAME_EXECUTION_FRAGMENT: NameExecutionFragment = {
  innerExecutions: [],
  verificationExpectations: [],
}

const buildResolverSetupFragment = (params: {
  readonly chainId: number
  readonly hca: Address
  readonly wallet: Address
  readonly name: string
  readonly resolver: Address
  readonly includeResolverVerification: boolean
  readonly includeResolverDeployment: boolean
  readonly includeWalletCoAdminGrant: boolean
}): NameExecutionFragment => {
  const contracts = getDestinationContracts(params.chainId)
  return {
    innerExecutions: [
      ...(params.includeResolverDeployment
        ? [
            {
              phase: 'resolver-deployment' as const,
              name: params.name,
              names: [params.name],
              call: buildResolverDeploymentCall({
                chainId: params.chainId,
                hca: params.hca,
              }),
            },
          ]
        : []),
      ...(params.includeWalletCoAdminGrant
        ? [
            {
              phase: 'wallet-co-admin-grant' as const,
              name: params.name,
              names: [params.name],
              call: buildWalletCoAdminCall({
                resolver: params.resolver,
                wallet: params.wallet,
              }),
            },
          ]
        : []),
    ],
    verificationExpectations: params.includeResolverVerification
      ? [
          {
            id: expectationId(params.name, 'resolver-implementation'),
            type: 'resolver-implementation',
            name: params.name,
            resolver: params.resolver,
            factory: contracts.verifiableFactory,
            expectedImplementation: contracts.permissionedResolverImpl,
            deployer: params.hca,
            salt: computeResolverSalt(params.hca),
          },
          {
            id: expectationId(params.name, 'resolver-root-roles'),
            type: 'resolver-root-roles',
            name: params.name,
            resolver: params.resolver,
            account: params.hca,
            rootName: ROOT_NAME,
            roleBitmap: ROLES_ALL,
          },
          {
            id: expectationId(params.name, 'wallet-name-roles'),
            type: 'wallet-name-roles',
            name: params.name,
            resolver: params.resolver,
            account: params.wallet,
            rootName: ROOT_NAME,
            roleBitmap: ROLES_ALL,
          },
        ]
      : [],
  }
}

const buildUserRegistryFragment = (params: {
  readonly chainId: number
  readonly hca: Address
  readonly wallet: Address
  readonly classified: ClassifiedName
  readonly userRegistries: ReadonlyMap<string, Address>
  readonly childRegistry: Address
}): NameExecutionFragment => {
  if (isAddressEqual(params.childRegistry, zeroAddress)) {
    return EMPTY_NAME_EXECUTION_FRAGMENT
  }

  const name = params.classified.domain.name
  const contracts = getDestinationContracts(params.chainId)
  const parentRegistry = parentRegistryFor({
    name: params.classified,
    userRegistries: params.userRegistries,
  })
  const setupCalls = buildUserRegistrySetupCalls({
    hca: params.hca,
    parentName: name,
    parentRegistry,
    parentLabel: params.classified.label,
    wallet: params.wallet,
  })
  const setupPhases = [
    'user-registry-deployment',
    'user-registry-wallet-grant',
    'user-registry-parent',
  ] as const

  return {
    innerExecutions: setupCalls.map((call, index) => ({
      phase: setupPhases[index] ?? 'user-registry-parent',
      name,
      names: [name],
      call,
    })),
    verificationExpectations: [
      {
        id: expectationId(name, 'user-registry-implementation'),
        type: 'user-registry-implementation',
        name,
        registry: params.childRegistry,
        factory: contracts.verifiableFactory,
        expectedImplementation: contracts.userRegistryImpl,
        deployer: params.hca,
        salt: computeUserRegistrySalt(name),
      },
      {
        id: expectationId(name, 'user-registry-root-roles', 'hca'),
        type: 'user-registry-root-roles',
        name,
        registry: params.childRegistry,
        account: params.hca,
        roleBitmap: ROLES_ALL,
      },
      {
        id: expectationId(name, 'user-registry-root-roles', 'wallet'),
        type: 'user-registry-root-roles',
        name,
        registry: params.childRegistry,
        account: params.wallet,
        roleBitmap: ROLES_ALL,
      },
      {
        id: expectationId(name, 'user-registry-parent'),
        type: 'user-registry-parent',
        name,
        registry: params.childRegistry,
        expectedParentRegistry: parentRegistry,
        expectedParentLabel: params.classified.label,
      },
    ],
  }
}

const buildCopyRegistrationExecution = (params: {
  readonly classified: ClassifiedName
  readonly userRegistries: ReadonlyMap<string, Address>
  readonly wallet: Address
  readonly childRegistry: Address
  readonly expectedResolver: Address
}): readonly AtomicMigrationInnerExecution[] => {
  if (params.classified.action !== 'copy') return []

  const name = params.classified.domain.name
  if (!params.classified.parentName) {
    throw new Error(`Copied name "${name}" has no parent`)
  }
  const parentRegistry = params.userRegistries.get(params.classified.parentName)
  if (!parentRegistry) {
    throw new Error(`Copied name "${name}" has no planned parent UserRegistry`)
  }
  return [
    {
      phase: 'copy-register',
      name,
      names: [name],
      call: buildRegisterCopiedSubnameCall({
        registry: parentRegistry,
        label: params.classified.label,
        owner: params.wallet,
        childRegistry: params.childRegistry,
        resolver: params.expectedResolver,
        expiry: params.classified.sourceExpiry,
      }),
    },
  ]
}

const buildNameStateExpectations = (params: {
  readonly classified: ClassifiedName
  readonly directRoute: DirectMigrationRoute | null
  readonly wallet: Address
  readonly expectedResolver: Address
  readonly childRegistry: Address
  readonly chainId: number
}): readonly AtomicMigrationVerificationExpectation[] => {
  const { classified, directRoute, wallet, expectedResolver, childRegistry } =
    params
  const name = classified.domain.name
  const node = namehash(name) as Hex
  const resource = labelToCanonicalId(classified.label)
  const registryPath = registryPathFor(classified)
  const contracts = getDestinationContracts(params.chainId)
  const commonExpectations: readonly AtomicMigrationVerificationExpectation[] =
    [
      {
        id: expectationId(name, 'name-owner'),
        type: 'name-owner',
        name,
        label: classified.label,
        node,
        resource,
        tokenType: classified.tokenType,
        registryPath,
        expectedOwner: wallet,
      },
      {
        id: expectationId(name, 'name-resolver'),
        type: 'name-resolver',
        name,
        label: classified.label,
        node,
        resource,
        registryPath,
        expectedResolver,
      },
    ]
  const subregistryExpectations: readonly AtomicMigrationVerificationExpectation[] =
    isLockedName(classified)
      ? []
      : [
          {
            id: expectationId(name, 'name-subregistry'),
            type: 'name-subregistry',
            name,
            label: classified.label,
            registryPath,
            expectedSubregistry: childRegistry,
          },
        ]
  const copyExpectations: readonly AtomicMigrationVerificationExpectation[] =
    classified.action === 'copy'
      ? [
          {
            id: expectationId(name, 'name-owner-roles'),
            type: 'name-owner-roles',
            name,
            registryPath,
            resource,
            account: wallet,
            roleBitmap: ROLES_ALL,
          },
          {
            id: expectationId(name, 'name-expiry'),
            type: 'name-expiry',
            name,
            registryPath,
            resource,
            expectedExpiry: classified.sourceExpiry,
          },
        ]
      : []

  let lockedExpectations: readonly AtomicMigrationVerificationExpectation[] = []
  if (isLockedName(classified)) {
    if (!directRoute?.expectedWrapperRegistry) {
      throw new Error(
        `Locked migration route for "${name}" has no deterministic WrapperRegistry`,
      )
    }
    lockedExpectations = [
      {
        id: expectationId(name, 'name-owner-roles'),
        type: 'name-owner-roles',
        name,
        registryPath,
        resource,
        account: wallet,
        roleBitmap: lockedNameOwnerRoleBitmap(classified.fuses),
      },
      {
        id: expectationId(name, 'wrapper-subregistry'),
        type: 'wrapper-subregistry',
        name,
        node,
        label: classified.label,
        registryPath,
        factory: contracts.verifiableFactory,
        expectedImplementation: contracts.wrapperRegistryImpl,
        expectedWrapperRegistry: directRoute.expectedWrapperRegistry,
      },
      {
        id: expectationId(name, 'wrapper-root-roles'),
        type: 'wrapper-root-roles',
        name,
        label: classified.label,
        registryPath,
        resource: ROOT_RESOURCE,
        account: wallet,
        roleBitmap: lockedWrapperRootRoleBitmap(classified.fuses),
      },
    ]
  }

  return [
    ...commonExpectations,
    ...subregistryExpectations,
    ...copyExpectations,
    ...lockedExpectations,
  ]
}

const buildManagerRoleFragment = (
  classified: ClassifiedName,
): NameExecutionFragment => {
  if (classified.action !== 'migrate' || !classified.managerAddress) {
    return EMPTY_NAME_EXECUTION_FRAGMENT
  }

  const name = classified.domain.name
  return {
    innerExecutions: [
      {
        phase: 'manager-role-grant',
        name,
        names: [name],
        call: buildRoleGrantCall(classified),
      },
    ],
    verificationExpectations: [
      {
        id: expectationId(name, 'manager-role'),
        type: 'manager-role',
        name,
        label: classified.label,
        registry: V2_CONTRACTS.ETHRegistry,
        resource: labelToCanonicalId(classified.label),
        account: classified.managerAddress,
        roleBitmap: ROLE_SET_RESOLVER,
      },
    ],
  }
}

const buildProfileReplayFragment = (params: {
  readonly classified: ClassifiedName
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly resolver: Address
}): NameExecutionFragment => {
  const profileEntry = profileForName(params.classified, params.profiles)
  if (!profileEntry) return EMPTY_NAME_EXECUTION_FRAGMENT

  const name = params.classified.domain.name
  const profileCalls = flattenProfileInnerCalls(
    new Map([[profileEntry.node, profileEntry.profile]]),
  )
  return {
    innerExecutions: [
      {
        phase: 'profile-replay',
        name,
        names: [name],
        call: wrapInnerCallsAsMulticall(params.resolver, profileCalls),
      },
    ],
    verificationExpectations: [
      ...profileEntry.profile.texts.map((record, index) => ({
        id: expectationId(name, 'profile-text', `${index}:${record.key}`),
        type: 'profile-text' as const,
        name,
        node: profileEntry.node,
        resolver: params.resolver,
        key: record.key,
        value: record.value,
      })),
      ...profileEntry.profile.addresses.map((record, index) => ({
        id: expectationId(
          name,
          'profile-address',
          `${index}:${record.coinType}`,
        ),
        type: 'profile-address' as const,
        name,
        node: profileEntry.node,
        resolver: params.resolver,
        coinType: record.coinType,
        value: record.value,
      })),
      ...(profileEntry.profile.contentHash
        ? [
            {
              id: expectationId(name, 'profile-contenthash'),
              type: 'profile-contenthash' as const,
              name,
              node: profileEntry.node,
              resolver: params.resolver,
              value: profileEntry.profile.contentHash,
            },
          ]
        : []),
      ...profileEntry.profile.abis.map((record, index) => ({
        id: expectationId(
          name,
          'profile-abi',
          `${index}:${record.contentType}`,
        ),
        type: 'profile-abi' as const,
        name,
        node: profileEntry.node,
        resolver: params.resolver,
        contentType: record.contentType,
        value: record.value,
      })),
    ],
  }
}

const buildNameExecution = (
  params: BuildNameExecutionParams,
): AtomicMigrationNameExecution => {
  const name = params.classified.domain.name
  const expectedResolver = resolverFor(
    params.classified,
    params.defaultResolver,
    params.resolver,
  )
  const childRegistry = params.userRegistries.get(name) ?? zeroAddress
  const migrationData =
    params.classified.action === 'migrate'
      ? createMigrationData({
          label: params.classified.label,
          owner: params.wallet,
          subregistry: childRegistry,
          resolver: expectedResolver,
        })
      : null
  const resolverSetup = buildResolverSetupFragment({
    ...params,
    name,
  })
  const userRegistrySetup = buildUserRegistryFragment({
    ...params,
    childRegistry,
  })
  const nameState: NameExecutionFragment = {
    innerExecutions: buildCopyRegistrationExecution({
      ...params,
      childRegistry,
      expectedResolver,
    }),
    verificationExpectations: buildNameStateExpectations({
      ...params,
      childRegistry,
      expectedResolver,
    }),
  }
  const managerRole = buildManagerRoleFragment(params.classified)
  const profileReplay = buildProfileReplayFragment(params)
  const fragments = [
    resolverSetup,
    userRegistrySetup,
    nameState,
    managerRole,
    profileReplay,
  ]

  return {
    classified: params.classified,
    directRoute: params.directRoute,
    migrationData,
    innerExecutions: fragments.flatMap((fragment) => fragment.innerExecutions),
    verificationExpectations: fragments.flatMap(
      (fragment) => fragment.verificationExpectations,
    ),
  }
}

const buildNameExecutions = (params: {
  readonly chainId: number
  readonly hca: Address
  readonly wallet: Address
  readonly classified: readonly ClassifiedName[]
  readonly registryContext: readonly ClassifiedName[]
  readonly directRoutes: ReadonlyMap<string, DirectMigrationRoute>
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly resolver: Address
  readonly defaultResolver: Address
  readonly resolverDeployed: boolean
  readonly walletCoAdminGranted: boolean
}): readonly AtomicMigrationNameExecution[] => {
  const directNames = params.classified.filter(
    (name): name is DirectClassifiedName => name.action === 'migrate',
  )
  // Preserve the direct migration route validator, then order the complete
  // migrate/copy graph so every copied node follows its selected parent.
  orderDirectMigrationNamesParentFirst(directNames)
  const ordered = orderPlannedNamesParentFirst(params.classified)
  const userRegistries = buildUserRegistryAddresses({
    hca: params.hca,
    registryContext: params.registryContext,
  })
  const firstResolverNameIndex = ordered.findIndex(
    (name) => name.resolverStrategy === 'to-owned-permres',
  )

  return ordered.map((classified, index) => {
    const receivesResolverSetup = index === firstResolverNameIndex
    const directRoute =
      classified.action === 'migrate'
        ? (params.directRoutes.get(classified.domain.name) ?? null)
        : null
    if (classified.action === 'migrate' && !directRoute) {
      throw new Error(
        `No verified migration route for "${classified.domain.name}"`,
      )
    }
    return buildNameExecution({
      ...params,
      classified,
      directRoute,
      userRegistries,
      includeResolverVerification: receivesResolverSetup,
      includeResolverDeployment:
        receivesResolverSetup && !params.resolverDeployed,
      includeWalletCoAdminGrant:
        receivesResolverSetup &&
        (!params.resolverDeployed || !params.walletCoAdminGranted),
    })
  })
}

/**
 * Finalize one outer HCA batch in contract-safe phase order. Helper inputs are
 * rebuilt from the names currently in the batch, so gas splitting and retry
 * removal cannot leave stale migration calldata behind.
 */
export const buildAtomicMigrationInnerExecutions = (params: {
  readonly nameExecutions: readonly AtomicMigrationNameExecution[]
}): readonly AtomicMigrationInnerExecution[] => {
  const existingInner = params.nameExecutions.flatMap(
    (nameExecution) => nameExecution.innerExecutions,
  )
  const helperInputs = params.nameExecutions.flatMap<MigrationHelperNameInput>(
    ({ classified, migrationData }) =>
      classified.action === 'migrate' && migrationData
        ? [
            {
              name: classified.domain.name,
              tokenType: classified.tokenType,
              parentName: classified.parentName,
              data: migrationData,
            },
          ]
        : [],
  )
  const firstMigration = helperInputs[0]
  const helperExecutions: readonly AtomicMigrationInnerExecution[] =
    firstMigration
      ? [
          {
            phase: 'migrate',
            name: firstMigration.name,
            names: helperInputs.map(({ name }) => name),
            call: buildMigrationHelperCall(helperInputs),
          },
        ]
      : []

  const executionsForPhase = (
    phase: Exclude<AtomicMigrationExecutionPhase, 'migrate'>,
  ): readonly AtomicMigrationInnerExecution[] =>
    existingInner.filter((execution) => execution.phase === phase)

  return [
    ...executionsForPhase('resolver-deployment'),
    ...executionsForPhase('wallet-co-admin-grant'),
    ...executionsForPhase('user-registry-deployment'),
    ...executionsForPhase('user-registry-wallet-grant'),
    ...executionsForPhase('user-registry-parent'),
    ...helperExecutions,
    ...executionsForPhase('copy-register'),
    ...executionsForPhase('manager-role-grant'),
    ...executionsForPhase('profile-replay'),
  ]
}

const estimateBatch = async (params: {
  readonly index: number
  readonly hca: Address
  readonly wallet: Address
  readonly nameExecutions: readonly AtomicMigrationNameExecution[]
  readonly estimateOuterGas: EstimateAtomicMigrationOuterGas
}): Promise<AtomicMigrationBatch> => {
  const innerExecutions = buildAtomicMigrationInnerExecutions({
    nameExecutions: params.nameExecutions,
  })
  const names = params.nameExecutions.map(
    (nameExecution) => nameExecution.classified.domain.name,
  )
  const outerCall: Call = buildHcaOwnerExecutionCall({
    hca: params.hca,
    calls: innerExecutions.map((execution) => execution.call),
  })
  const estimatedGas = await params.estimateOuterGas({
    call: outerCall,
    names,
    innerExecutions,
  })

  return {
    index: params.index,
    names,
    operations: params.nameExecutions.map(({ classified }) => ({
      name: classified.domain.name,
      action: classified.action,
    })),
    nameExecutions: params.nameExecutions,
    innerExecutions,
    outerCall,
    estimatedGas,
    verificationExpectations: params.nameExecutions.flatMap(
      (nameExecution) => nameExecution.verificationExpectations,
    ),
  }
}

type EstimateAtomicPrefix = (size: number) => Promise<AtomicMigrationBatch>

const createAtomicPrefixEstimator = (params: {
  readonly hca: Address
  readonly wallet: Address
  readonly nameExecutions: readonly AtomicMigrationNameExecution[]
  readonly estimateOuterGas: EstimateAtomicMigrationOuterGas
}): EstimateAtomicPrefix => {
  const attempts = new Map<number, Promise<AtomicMigrationBatch>>()

  return (size) => {
    const cached = attempts.get(size)
    if (cached) return cached

    const pending = estimateBatch({
      index: 0,
      hca: params.hca,
      wallet: params.wallet,
      nameExecutions: params.nameExecutions.slice(0, size),
      estimateOuterGas: params.estimateOuterGas,
    })
    attempts.set(size, pending)
    return pending
  }
}

const singleNameGasLimitError = (
  batch: AtomicMigrationBatch,
  maxOuterGas: bigint,
): AtomicMigrationNameGasLimitExceededError =>
  new AtomicMigrationNameGasLimitExceededError({
    ensName: batch.names[0] ?? 'unknown',
    estimatedGas: batch.estimatedGas,
    maxOuterGas,
  })

const findLargestAtomicPrefixWithinGasLimit = async (params: {
  readonly overLimitSize: number
  readonly maxOuterGas: bigint
  readonly estimatePrefix: EstimateAtomicPrefix
}): Promise<AtomicMigrationBatch> => {
  let lowerSize = 1
  let upperSize = params.overLimitSize
  let lowerBatch = await params.estimatePrefix(lowerSize)
  if (lowerBatch.estimatedGas > params.maxOuterGas) {
    throw singleNameGasLimitError(lowerBatch, params.maxOuterGas)
  }

  while (upperSize - lowerSize > 1) {
    const midpoint = Math.floor((lowerSize + upperSize) / 2)
    const candidate = await params.estimatePrefix(midpoint)
    if (candidate.estimatedGas <= params.maxOuterGas) {
      lowerSize = midpoint
      lowerBatch = candidate
      continue
    }
    upperSize = midpoint
  }

  return lowerBatch
}

/**
 * Verifies the preview-derived leading batch with one live estimate.
 *
 * The preview already controls batch sizing, so execution does not grow past
 * that boundary. If its live estimate numerically exceeds the execution limit,
 * a downward binary search finds a safe prefix. Estimate errors are propagated
 * immediately instead of being mistaken for a splittable gas boundary.
 */
const buildFirstAtomicMigrationBatch = async (params: {
  readonly hca: Address
  readonly wallet: Address
  readonly nameExecutions: readonly AtomicMigrationNameExecution[]
  readonly maxOuterGas: bigint
  readonly estimateOuterGas: EstimateAtomicMigrationOuterGas
  readonly initialBatchSize?: number
}): Promise<AtomicMigrationBatch | null> => {
  const total = params.nameExecutions.length
  if (total === 0) return null

  const requestedHint = Math.trunc(params.initialBatchSize ?? 1)
  const hint = Math.min(
    total,
    Math.max(1, Number.isFinite(requestedHint) ? requestedHint : 1),
  )
  const estimatePrefix = createAtomicPrefixEstimator(params)
  const hintedBatch = await estimatePrefix(hint)
  if (hintedBatch.estimatedGas <= params.maxOuterGas) return hintedBatch

  return findLargestAtomicPrefixWithinGasLimit({
    overLimitSize: hint,
    maxOuterGas: params.maxOuterGas,
    estimatePrefix,
  })
}

/**
 * Builds all-or-nothing HCA owner executions and greedily partitions them using
 * estimates of the fully wrapped `executeByOwner` call. A name is never split
 * across outer calls.
 */
export const buildAtomicMigrationBatches = async (
  params: BuildAtomicMigrationBatchesParams,
): Promise<AtomicMigrationBatchPlan> => {
  if (params.maxOuterGas <= 0n) {
    throw new Error('buildAtomicMigrationBatches: maxOuterGas must be positive')
  }

  const resolver = computeResolverAddress({
    chainId: params.chainId,
    hca: params.hca,
  })
  const nameExecutions = buildNameExecutions({
    ...params,
    registryContext: params.registryContext ?? params.classified,
    resolver,
    defaultResolver: params.defaultResolver ?? V2_CONTRACTS.DefaultResolver,
  })

  if (params.firstBatchOnly) {
    const batch = await buildFirstAtomicMigrationBatch({
      hca: params.hca,
      wallet: params.wallet,
      nameExecutions,
      maxOuterGas: params.maxOuterGas,
      estimateOuterGas: params.estimateOuterGas,
      initialBatchSize: params.initialBatchSize,
    })
    return { resolver, batches: batch ? [batch] : [] }
  }

  const batches: AtomicMigrationBatch[] = []
  let currentNameExecutions: readonly AtomicMigrationNameExecution[] = []
  let currentBatch: AtomicMigrationBatch | null = null

  for (const nameExecution of nameExecutions) {
    const candidateNameExecutions = [...currentNameExecutions, nameExecution]
    const candidate = await estimateBatch({
      index: batches.length,
      hca: params.hca,
      wallet: params.wallet,
      nameExecutions: candidateNameExecutions,
      estimateOuterGas: params.estimateOuterGas,
    })

    if (candidate.estimatedGas <= params.maxOuterGas) {
      currentNameExecutions = candidateNameExecutions
      currentBatch = candidate
      continue
    }

    if (!currentBatch) {
      throw new AtomicMigrationNameGasLimitExceededError({
        ensName: nameExecution.classified.domain.name,
        estimatedGas: candidate.estimatedGas,
        maxOuterGas: params.maxOuterGas,
      })
    }

    batches.push(currentBatch)
    const singleNameBatch = await estimateBatch({
      index: batches.length,
      hca: params.hca,
      wallet: params.wallet,
      nameExecutions: [nameExecution],
      estimateOuterGas: params.estimateOuterGas,
    })
    if (singleNameBatch.estimatedGas > params.maxOuterGas) {
      throw new AtomicMigrationNameGasLimitExceededError({
        ensName: nameExecution.classified.domain.name,
        estimatedGas: singleNameBatch.estimatedGas,
        maxOuterGas: params.maxOuterGas,
      })
    }
    currentNameExecutions = [nameExecution]
    currentBatch = singleNameBatch
  }

  if (currentBatch) batches.push(currentBatch)
  return { resolver, batches }
}
