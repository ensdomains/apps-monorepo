import {
  computeResolverAddress,
  getDestinationContracts,
  ROLES_ALL,
} from '@ens-apps/smart-account'
import { userRegistryRegisterSnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import {
  type Address,
  decodeFunctionData,
  getAddress,
  type Hex,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import { sepolia } from 'viem/chains'
import { assert, describe, expect, it, vi } from 'vitest'

import { MIGRATION_HELPER_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import { dnsEncodeName } from '../utils/dnsEncodeName'
import { makeClassified } from './_fixtures'
import { TARGET_GAS } from './batchMigrate.constants'
import {
  AtomicMigrationNameGasLimitExceededError,
  buildAtomicMigrationBatches,
  buildAtomicMigrationInnerExecutions,
  lockedNameOwnerRoleBitmap,
  lockedWrapperRootRoleBitmap,
} from './buildAtomicMigrationBatches'
import { type ClassifiedName, FUSES } from './classifyNames'
import {
  computeExpectedWrapperRegistry,
  type DirectMigrationRoute,
} from './directMigrationRoutes'
import type { Profile } from './fetchV1Profiles'
import {
  buildRegisterCopiedSubnameCall,
  buildUserRegistrySetupCalls,
  computeUserRegistryAddress,
  computeUserRegistrySalt,
} from './userRegistryMigration'

const HCA: Address = '0x00000000000000000000000000000000000000a1'
const WALLET: Address = '0x00000000000000000000000000000000000000b1'
const MANAGER: Address = '0x00000000000000000000000000000000000000c1'
const DEFAULT_RESOLVER: Address = '0x00000000000000000000000000000000000000d1'
const V1_RESOLVER: Address = '0x00000000000000000000000000000000000000e1'
const PROFILE_ADDRESS = '0x0000000000000000000000000000000000000abc' as Hex

const ROLE_REGISTRAR = 1n << 0n
const ROLE_RENEW = 1n << 16n
const ROLE_SET_RESOLVER = 1n << 24n
const ROLE_CAN_NAME = 1n << 120n
const ROLE_UPGRADE = 1n << 124n
const ROLE_CAN_TRANSFER_ADMIN = 1n << 156n

const hcaOwnerExecutionAbi = parseAbi([
  'function executeByOwner((address target, uint256 value, bytes callData)[] executions) payable',
])

const makeName = (
  name: string,
  overrides: Parameters<typeof makeClassified>[0] = {},
): ClassifiedName =>
  makeClassified({
    id: name,
    labelhash: name,
    label: name.split('.')[0],
    name,
    ...overrides,
  })

const directRoutesFor = (
  classified: readonly ClassifiedName[],
): ReadonlyMap<string, DirectMigrationRoute> =>
  new Map(
    classified
      .filter((name) => name.action === 'migrate')
      .map((name) => {
        const isChild =
          name.tokenType === 'locked-child' ||
          name.tokenType === 'detached-child'
        const createsWrapper =
          name.tokenType === 'locked-2ld' || name.tokenType === 'locked-child'
        const receiver = isChild
          ? computeExpectedWrapperRegistry({ name: name.parentName ?? 'eth' })
          : name.tokenType === 'locked-2ld'
            ? V2_CONTRACTS.LockedMigrationController
            : V2_CONTRACTS.UnlockedMigrationController
        return [
          name.domain.name,
          {
            name: name.domain.name,
            receiver,
            parentDependency: isChild ? name.parentName : null,
            expectedWrapperRegistry: createsWrapper
              ? computeExpectedWrapperRegistry({ name: name.domain.name })
              : null,
            receiverReadiness: isChild
              ? 'created-earlier-in-plan'
              : 'migration-controller',
          } satisfies DirectMigrationRoute,
        ] as const
      }),
  )

const buildPlan = (
  overrides: Partial<Parameters<typeof buildAtomicMigrationBatches>[0]> = {},
) => {
  const classified = overrides.classified ?? [makeName('alice.eth')]
  return buildAtomicMigrationBatches({
    chainId: sepolia.id,
    hca: HCA,
    wallet: WALLET,
    profiles: new Map(),
    defaultResolver: DEFAULT_RESOLVER,
    resolverDeployed: false,
    walletCoAdminGranted: false,
    maxOuterGas: 1_000_000n,
    estimateOuterGas: () => 100_000n,
    ...overrides,
    classified,
    directRoutes: overrides.directRoutes ?? directRoutesFor(classified),
  })
}

type OwnerExecution = {
  readonly target: Address
  readonly value: bigint
  readonly callData: Hex
}

const decodeOwnerExecutions = (data: Hex): readonly OwnerExecution[] => {
  const decoded = decodeFunctionData({ abi: hcaOwnerExecutionAbi, data })
  expect(decoded.functionName).toBe('executeByOwner')
  const [executions] = decoded.args as [readonly OwnerExecution[]]
  return executions
}

const ROLE_SET_RESOLVER_ADMIN = ROLE_SET_RESOLVER << 128n

const grantRolesAbi = parseAbi([
  'function grantRoles(uint256 resource, uint256 roleBitmap, address account) returns (bool)',
])

const decodeGrants = (batch: {
  readonly innerExecutions: readonly {
    readonly phase: string
    readonly call: { readonly data: Hex }
  }[]
}) =>
  batch.innerExecutions
    .filter((execution) => execution.phase === 'manager-role-grant')
    .map((execution) => {
      const [resource, roleBitmap, account] = decodeFunctionData({
        abi: grantRolesAbi,
        data: execution.call.data,
      }).args as [bigint, bigint, Address]
      return { resource, roleBitmap, account: account.toLowerCase() }
    })

describe('manager role restoration (WEB-1528)', () => {
  it('emits no role grant for a name whose registrant and controller differ but was not opted in', async () => {
    // What classification now produces on its own: the divergent controller is
    // recorded, and `managerAddress` stays null until the owner opts in.
    const plan = await buildPlan({
      classified: [
        makeName('alice.eth', {
          registryController: MANAGER,
          managerAddress: null,
        }),
      ],
    })
    const batch = plan.batches[0]
    assert(batch)

    expect(
      batch.innerExecutions.map((execution) => execution.phase),
    ).not.toContain('manager-role-grant')
    expect(decodeGrants(batch)).toEqual([])
  })

  it('leaves a migrated name with no third-party ROLE_SET_RESOLVER holder when nothing is opted in', async () => {
    const plan = await buildPlan({
      classified: [makeName('alice.eth', { registryController: MANAGER })],
    })
    const batch = plan.batches[0]
    assert(batch)

    const roleHolders = batch.verificationExpectations
      .filter((expectation) => 'account' in expectation)
      .map((expectation) => (expectation as { account: Address }).account)
      .map((account) => account.toLowerCase())

    expect(roleHolders).not.toContain(MANAGER.toLowerCase())
    expect(
      batch.verificationExpectations.some(
        (expectation) => expectation.type === 'manager-role',
      ),
    ).toBe(false)
  })

  it('grants the opted-in manager ROLE_SET_RESOLVER and the owner its admin counterpart', async () => {
    const plan = await buildPlan({
      classified: [
        makeName('alice.eth', {
          registryController: MANAGER,
          managerAddress: MANAGER,
        }),
      ],
    })
    const batch = plan.batches[0]
    assert(batch)

    const grants = decodeGrants(batch)
    expect(grants).toHaveLength(2)
    const [managerGrant, adminGrant] = grants
    assert(managerGrant)
    assert(adminGrant)

    expect(managerGrant.roleBitmap).toBe(ROLE_SET_RESOLVER)
    expect(managerGrant.account).toBe(MANAGER.toLowerCase())
    // The admin sits with the owner, on the same resource, so the restored
    // manager can always be removed again.
    expect(adminGrant.roleBitmap).toBe(ROLE_SET_RESOLVER_ADMIN)
    expect(adminGrant.account).toBe(WALLET.toLowerCase())
    expect(adminGrant.resource).toBe(managerGrant.resource)
  })

  it('verifies both the manager role and the owner admin role after the batch', async () => {
    const plan = await buildPlan({
      classified: [
        makeName('alice.eth', {
          registryController: MANAGER,
          managerAddress: MANAGER,
        }),
      ],
    })
    const batch = plan.batches[0]
    assert(batch)

    const managerRoles = batch.verificationExpectations
      .filter((expectation) => expectation.type === 'manager-role')
      .map((expectation) => {
        const { account, roleBitmap } = expectation as {
          account: Address
          roleBitmap: bigint
        }
        return { account: account.toLowerCase(), roleBitmap }
      })

    expect(managerRoles).toEqual([
      { account: MANAGER.toLowerCase(), roleBitmap: ROLE_SET_RESOLVER },
      { account: WALLET.toLowerCase(), roleBitmap: ROLE_SET_RESOLVER_ADMIN },
    ])
  })
})

describe('buildAtomicMigrationBatches', () => {
  it('keeps parent-before-child order and wraps complete per-name executions', async () => {
    const parent = makeName('parent.eth', {
      tokenType: 'locked-2ld',
      parentName: 'eth',
      fuses: FUSES.CANNOT_UNWRAP,
      managerAddress: MANAGER,
      resolverStrategy: 'to-owned-permres',
    })
    const child = makeName('sub.parent.eth', {
      tokenType: 'locked-child',
      parentName: 'parent.eth',
      fuses: FUSES.CANNOT_UNWRAP,
      resolverStrategy: 'to-owned-permres',
    })
    const parentNode = namehash(parent.domain.name) as Hex
    const profile: Profile = {
      texts: [{ key: 'email', value: 'parent@example.com' }],
      addresses: [{ coinType: 60n, value: PROFILE_ADDRESS }],
      contentHash: '0xe301' as Hex,
      abis: [{ contentType: 1n, value: '0x5b5d' as Hex }],
    }

    const plan = await buildPlan({
      classified: [child, parent],
      profiles: new Map([[parentNode, profile]]),
    })
    const batch = plan.batches[0]
    assert(batch)

    expect(batch.names).toEqual(['parent.eth', 'sub.parent.eth'])
    expect(batch.innerExecutions.map((execution) => execution.phase)).toEqual([
      'resolver-deployment',
      'wallet-co-admin-grant',
      'migrate',
      'manager-role-grant',
      'manager-role-grant',
      'profile-replay',
    ])
    expect(batch.innerExecutions.map((execution) => execution.name)).toEqual([
      'parent.eth',
      'parent.eth',
      'parent.eth',
      'parent.eth',
      'parent.eth',
      'parent.eth',
    ])

    expect(batch.outerCall.to).toBe(HCA)
    expect(batch.outerCall.value).toBe(0n)
    const wrappedExecutions = decodeOwnerExecutions(batch.outerCall.data)
    expect(
      wrappedExecutions.map((execution) => ({
        ...execution,
        target: execution.target.toLowerCase(),
      })),
    ).toEqual(
      batch.innerExecutions.map(({ call }) => ({
        target: call.to.toLowerCase(),
        value: call.value,
        callData: call.data,
      })),
    )

    const migrate = batch.innerExecutions.find(
      (execution) =>
        execution.name === 'parent.eth' && execution.phase === 'migrate',
    )
    assert(migrate)
    const decodedMigrate = decodeFunctionData({
      abi: MIGRATION_HELPER_ABI,
      data: migrate.call.data,
    })
    expect(migrate.call.to).toBe(V2_CONTRACTS.MigrationHelper)
    expect(migrate.names).toEqual(['parent.eth', 'sub.parent.eth'])
    expect(decodedMigrate.functionName).toBe('migrate')
    expect(decodedMigrate.args[2]).toEqual([
      [expect.objectContaining({ label: 'parent', owner: getAddress(WALLET) })],
    ])
    expect(decodedMigrate.args[3]).toEqual([
      {
        parentName: dnsEncodeName('parent.eth'),
        groups: [
          [
            expect.objectContaining({
              label: 'sub',
              owner: getAddress(WALLET),
            }),
          ],
        ],
      },
    ])

    const expectationTypes = batch.verificationExpectations.map(
      (expectation) => expectation.type,
    )
    expect(expectationTypes).toEqual([
      'resolver-implementation',
      'resolver-root-roles',
      'wallet-name-roles',
      'name-owner',
      'name-resolver',
      'name-owner-roles',
      'wrapper-subregistry',
      'wrapper-root-roles',
      'manager-role',
      'manager-role',
      'profile-text',
      'profile-address',
      'profile-contenthash',
      'profile-abi',
      'name-owner',
      'name-resolver',
      'name-owner-roles',
      'wrapper-subregistry',
      'wrapper-root-roles',
    ])

    const implementationExpectation = batch.verificationExpectations.find(
      (expectation) => expectation.type === 'resolver-implementation',
    )
    assert(implementationExpectation?.type === 'resolver-implementation')
    expect(implementationExpectation).toMatchObject({
      resolver: computeResolverAddress({ chainId: sepolia.id, hca: HCA }),
      factory: getDestinationContracts(sepolia.id).verifiableFactory,
      expectedImplementation: getDestinationContracts(sepolia.id)
        .permissionedResolverImpl,
      deployer: HCA,
    })

    const rootRolesExpectation = batch.verificationExpectations.find(
      (expectation) => expectation.type === 'resolver-root-roles',
    )
    assert(rootRolesExpectation?.type === 'resolver-root-roles')
    expect(rootRolesExpectation.account).toBe(HCA)
    expect(rootRolesExpectation.roleBitmap).toBe(ROLES_ALL)

    const walletRolesExpectation = batch.verificationExpectations.find(
      (expectation) => expectation.type === 'wallet-name-roles',
    )
    assert(walletRolesExpectation?.type === 'wallet-name-roles')
    expect(walletRolesExpectation).toMatchObject({
      account: WALLET,
      rootName: '0x00',
      roleBitmap: ROLES_ALL,
    })

    const parentOwnerExpectation = batch.verificationExpectations.find(
      (expectation) =>
        expectation.type === 'name-owner' && expectation.name === 'parent.eth',
    )
    assert(parentOwnerExpectation?.type === 'name-owner')
    expect(parentOwnerExpectation).toMatchObject({
      label: 'parent',
      tokenType: 'locked-2ld',
      expectedOwner: WALLET,
      registryPath: {
        type: 'eth-registry-2ld',
        registry: V2_CONTRACTS.ETHRegistry,
      },
    })

    const childOwnerExpectation = batch.verificationExpectations.find(
      (expectation) =>
        expectation.type === 'name-owner' &&
        expectation.name === 'sub.parent.eth',
    )
    assert(childOwnerExpectation?.type === 'name-owner')
    expect(childOwnerExpectation.registryPath).toMatchObject({
      type: 'parent-subregistry',
      rootRegistry: V2_CONTRACTS.ETHRegistry,
      parentName: 'parent.eth',
    })

    const childOwnerRolesExpectation = batch.verificationExpectations.find(
      (expectation) =>
        expectation.type === 'name-owner-roles' &&
        expectation.name === 'sub.parent.eth',
    )
    assert(childOwnerRolesExpectation?.type === 'name-owner-roles')
    expect(childOwnerRolesExpectation).toMatchObject({
      account: WALLET,
      roleBitmap:
        ROLE_SET_RESOLVER |
        (ROLE_SET_RESOLVER << 128n) |
        ROLE_CAN_TRANSFER_ADMIN,
    })

    const wrapperExpectation = batch.verificationExpectations.find(
      (expectation) =>
        expectation.type === 'wrapper-subregistry' &&
        expectation.name === 'sub.parent.eth',
    )
    assert(wrapperExpectation?.type === 'wrapper-subregistry')
    expect(wrapperExpectation).toMatchObject({
      label: 'sub',
      node: namehash('sub.parent.eth'),
      factory: V2_CONTRACTS.VerifiableFactory,
      expectedImplementation: V2_CONTRACTS.WrapperRegistryImpl,
    })

    const wrapperRolesExpectation = batch.verificationExpectations.find(
      (expectation) =>
        expectation.type === 'wrapper-root-roles' &&
        expectation.name === 'sub.parent.eth',
    )
    assert(wrapperRolesExpectation?.type === 'wrapper-root-roles')
    const baseWrapperRoles =
      ROLE_REGISTRAR | ROLE_RENEW | ROLE_CAN_NAME | ROLE_UPGRADE
    expect(wrapperRolesExpectation).toMatchObject({
      resource: 0n,
      account: WALLET,
      roleBitmap: baseWrapperRoles | (baseWrapperRoles << 128n),
    })

    const profileExpectations = batch.verificationExpectations.filter(
      (expectation) =>
        expectation.type === 'profile-text' ||
        expectation.type === 'profile-address' ||
        expectation.type === 'profile-contenthash' ||
        expectation.type === 'profile-abi',
    )
    expect(profileExpectations).toEqual([
      expect.objectContaining({
        type: 'profile-text',
        node: parentNode,
        key: 'email',
        value: 'parent@example.com',
      }),
      expect.objectContaining({
        type: 'profile-address',
        node: parentNode,
        coinType: 60n,
        value: PROFILE_ADDRESS,
      }),
      expect.objectContaining({
        type: 'profile-contenthash',
        node: parentNode,
        value: '0xe301',
      }),
      expect.objectContaining({
        type: 'profile-abi',
        node: parentNode,
        contentType: 1n,
        value: '0x5b5d',
      }),
    ])
  })

  it('builds an arbitrary-depth copy tree in dependency-safe calldata order', async () => {
    const root = makeName('example.eth', {
      action: 'migrate',
      tokenType: 'unwrapped',
      parentName: 'eth',
      label: 'example',
    })
    const fooExpiry = 2_000_000_000n
    const foo = makeName('foo.example.eth', {
      action: 'copy',
      tokenType: 'unlocked-child',
      parentName: 'example.eth',
      label: 'foo',
      sourceExpiry: fooExpiry,
    })
    const registryExpiry = (1n << 64n) - 1n
    const bar = makeName('bar.foo.example.eth', {
      action: 'copy',
      tokenType: 'registry-child',
      parentName: 'foo.example.eth',
      label: 'bar',
      sourceExpiry: registryExpiry,
    })
    const fooNode = namehash(foo.domain.name) as Hex
    const fooProfile: Profile = {
      texts: [{ key: 'url', value: 'https://example.com/foo' }],
      addresses: [{ coinType: 60n, value: PROFILE_ADDRESS }],
      contentHash: '0xe301' as Hex,
      abis: [{ contentType: 1n, value: '0x5b5d' as Hex }],
    }

    const plan = await buildPlan({
      // Deliberately reverse the input to prove graph ordering is authoritative.
      classified: [bar, foo, root],
      profiles: new Map([[fooNode, fooProfile]]),
      resolverDeployed: true,
      walletCoAdminGranted: true,
    })
    const batch = plan.batches[0]
    assert(batch)

    const exampleRegistry = computeUserRegistryAddress({
      hca: HCA,
      parentName: root.domain.name,
    })
    const fooRegistry = computeUserRegistryAddress({
      hca: HCA,
      parentName: foo.domain.name,
    })
    const exampleSetup = buildUserRegistrySetupCalls({
      hca: HCA,
      parentName: root.domain.name,
      parentRegistry: V2_CONTRACTS.ETHRegistry,
      parentLabel: root.label,
      wallet: WALLET,
    })
    const fooSetup = buildUserRegistrySetupCalls({
      hca: HCA,
      parentName: foo.domain.name,
      parentRegistry: exampleRegistry,
      parentLabel: foo.label,
      wallet: WALLET,
    })
    expect(batch.names).toEqual([
      'example.eth',
      'foo.example.eth',
      'bar.foo.example.eth',
    ])
    expect(batch.operations).toEqual([
      { name: 'example.eth', action: 'migrate' },
      { name: 'foo.example.eth', action: 'copy' },
      { name: 'bar.foo.example.eth', action: 'copy' },
    ])
    expect(
      batch.innerExecutions.map(({ phase, name }) => ({ phase, name })),
    ).toEqual([
      { phase: 'user-registry-deployment', name: 'example.eth' },
      { phase: 'user-registry-deployment', name: 'foo.example.eth' },
      { phase: 'user-registry-wallet-grant', name: 'example.eth' },
      { phase: 'user-registry-wallet-grant', name: 'foo.example.eth' },
      { phase: 'user-registry-parent', name: 'example.eth' },
      { phase: 'user-registry-parent', name: 'foo.example.eth' },
      { phase: 'migrate', name: 'example.eth' },
      { phase: 'copy-register', name: 'foo.example.eth' },
      { phase: 'copy-register', name: 'bar.foo.example.eth' },
      { phase: 'profile-replay', name: 'foo.example.eth' },
    ])

    const helperExecution = batch.innerExecutions.find(
      ({ phase }) => phase === 'migrate',
    )
    assert(helperExecution)
    expect(helperExecution.names).toEqual(['example.eth'])
    const decodedMigrate = decodeFunctionData({
      abi: MIGRATION_HELPER_ABI,
      data: helperExecution.call.data,
    })
    expect(decodedMigrate.functionName).toBe('migrate')
    expect(decodedMigrate.args).toEqual([
      [
        {
          label: 'example',
          owner: getAddress(WALLET),
          subregistry: getAddress(exampleRegistry),
          resolver: getAddress(plan.resolver),
        },
      ],
      [],
      [],
      [],
    ])

    const fooCopyCall = buildRegisterCopiedSubnameCall({
      registry: exampleRegistry,
      label: 'foo',
      owner: WALLET,
      childRegistry: fooRegistry,
      resolver: plan.resolver,
      expiry: fooExpiry,
    })
    const barCopyCall = buildRegisterCopiedSubnameCall({
      registry: fooRegistry,
      label: 'bar',
      owner: WALLET,
      childRegistry: zeroAddress,
      resolver: plan.resolver,
      expiry: registryExpiry,
    })
    expect(batch.innerExecutions.slice(0, 9).map(({ call }) => call)).toEqual([
      exampleSetup[0],
      fooSetup[0],
      exampleSetup[1],
      fooSetup[1],
      exampleSetup[2],
      fooSetup[2],
      helperExecution.call,
      fooCopyCall,
      barCopyCall,
    ])

    const rootExecution = batch.nameExecutions.find(
      ({ classified }) => classified.domain.name === 'example.eth',
    )
    const fooExecution = batch.nameExecutions.find(
      ({ classified }) => classified.domain.name === 'foo.example.eth',
    )
    const barExecution = batch.nameExecutions.find(
      ({ classified }) => classified.domain.name === 'bar.foo.example.eth',
    )
    assert(rootExecution)
    assert(fooExecution)
    assert(barExecution)
    expect(rootExecution.migrationData).toMatchObject({
      subregistry: exampleRegistry,
      owner: WALLET,
      resolver: plan.resolver,
    })
    expect(fooExecution).toMatchObject({
      directRoute: null,
      migrationData: null,
    })
    expect(barExecution).toMatchObject({
      directRoute: null,
      migrationData: null,
    })

    const [fooRegistration, barRegistration] = batch.innerExecutions.filter(
      ({ phase }) => phase === 'copy-register',
    )
    assert(fooRegistration)
    assert(barRegistration)
    expect(fooRegistration.call.to).toBe(exampleRegistry)
    expect(barRegistration.call.to).toBe(fooRegistry)
    const decodedFooRegistration = decodeFunctionData({
      abi: userRegistryRegisterSnippet,
      data: fooRegistration.call.data,
    })
    const decodedBarRegistration = decodeFunctionData({
      abi: userRegistryRegisterSnippet,
      data: barRegistration.call.data,
    })
    expect(decodedFooRegistration.args[0]).toBe('foo')
    expect(decodedFooRegistration.args[5]).toBe(fooExpiry)
    expect(decodedBarRegistration.args[0]).toBe('bar')
    expect(decodedBarRegistration.args[5]).toBe(registryExpiry)

    const expectationFor = (
      type: (typeof batch.verificationExpectations)[number]['type'],
      name: string,
    ) =>
      batch.verificationExpectations.find(
        (expectation) => expectation.type === type && expectation.name === name,
      )

    expect(
      expectationFor('user-registry-implementation', 'example.eth'),
    ).toMatchObject({
      registry: exampleRegistry,
      factory: V2_CONTRACTS.VerifiableFactory,
      expectedImplementation: V2_CONTRACTS.UserRegistryImpl,
      deployer: HCA,
      salt: computeUserRegistrySalt('example.eth'),
    })
    expect(
      expectationFor('user-registry-parent', 'foo.example.eth'),
    ).toMatchObject({
      registry: fooRegistry,
      expectedParentRegistry: exampleRegistry,
      expectedParentLabel: 'foo',
    })
    expect(
      batch.verificationExpectations.filter(
        (expectation) =>
          expectation.type === 'user-registry-root-roles' &&
          expectation.name === 'foo.example.eth',
      ),
    ).toEqual([
      expect.objectContaining({
        registry: fooRegistry,
        account: HCA,
        roleBitmap: ROLES_ALL,
      }),
      expect.objectContaining({
        registry: fooRegistry,
        account: WALLET,
        roleBitmap: ROLES_ALL,
      }),
    ])
    expect(expectationFor('name-subregistry', 'example.eth')).toMatchObject({
      expectedSubregistry: exampleRegistry,
    })
    expect(expectationFor('name-subregistry', 'foo.example.eth')).toMatchObject(
      {
        expectedSubregistry: fooRegistry,
      },
    )
    expect(
      expectationFor('name-subregistry', 'bar.foo.example.eth'),
    ).toMatchObject({
      expectedSubregistry: zeroAddress,
    })

    expect(expectationFor('name-owner', 'bar.foo.example.eth')).toMatchObject({
      expectedOwner: WALLET,
      registryPath: {
        type: 'parent-subregistry',
        parentName: 'foo.example.eth',
      },
    })
    expect(expectationFor('name-resolver', 'foo.example.eth')).toMatchObject({
      expectedResolver: plan.resolver,
    })
    expect(expectationFor('name-owner-roles', 'foo.example.eth')).toMatchObject(
      {
        account: WALLET,
        roleBitmap: ROLES_ALL,
      },
    )
    expect(expectationFor('name-expiry', 'foo.example.eth')).toMatchObject({
      expectedExpiry: fooExpiry,
    })
    expect(expectationFor('name-expiry', 'bar.foo.example.eth')).toMatchObject({
      expectedExpiry: registryExpiry,
    })
    expect(
      batch.verificationExpectations.filter(
        (expectation) => expectation.name === 'foo.example.eth',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'profile-text' }),
        expect.objectContaining({ type: 'profile-address' }),
        expect.objectContaining({ type: 'profile-contenthash' }),
        expect.objectContaining({ type: 'profile-abi' }),
      ]),
    )
  })

  it('derives locked owner and WrapperRegistry root roles from NameWrapper fuses', () => {
    expect(lockedNameOwnerRoleBitmap(FUSES.CANNOT_UNWRAP)).toBe(
      ROLE_SET_RESOLVER | (ROLE_SET_RESOLVER << 128n) | ROLE_CAN_TRANSFER_ADMIN,
    )
    expect(
      lockedNameOwnerRoleBitmap(
        FUSES.CANNOT_UNWRAP |
          FUSES.CANNOT_BURN_FUSES |
          FUSES.CANNOT_SET_RESOLVER |
          FUSES.CANNOT_TRANSFER |
          FUSES.CAN_EXTEND_EXPIRY,
      ),
    ).toBe(ROLE_RENEW)

    const baseWrapperRoles =
      ROLE_REGISTRAR | ROLE_RENEW | ROLE_CAN_NAME | ROLE_UPGRADE
    expect(lockedWrapperRootRoleBitmap(FUSES.CANNOT_UNWRAP)).toBe(
      baseWrapperRoles | (baseWrapperRoles << 128n),
    )
    expect(
      lockedWrapperRootRoleBitmap(
        FUSES.CANNOT_UNWRAP |
          FUSES.CANNOT_CREATE_SUBDOMAIN |
          FUSES.CANNOT_BURN_FUSES,
      ),
    ).toBe(ROLE_RENEW | ROLE_CAN_NAME | ROLE_UPGRADE)
  })

  it('requires a certified WrapperRegistry for a locked 2LD', async () => {
    const plan = await buildPlan({
      classified: [
        makeName('locked.eth', {
          tokenType: 'locked-2ld',
          fuses: FUSES.CANNOT_UNWRAP,
        }),
      ],
    })
    const batch = plan.batches[0]
    assert(batch)

    const wrapperExpectation = batch.verificationExpectations.find(
      (expectation) => expectation.type === 'wrapper-subregistry',
    )
    assert(wrapperExpectation?.type === 'wrapper-subregistry')
    expect(wrapperExpectation).toMatchObject({
      name: 'locked.eth',
      label: 'locked',
      registryPath: {
        type: 'eth-registry-2ld',
        registry: V2_CONTRACTS.ETHRegistry,
      },
      expectedImplementation: V2_CONTRACTS.WrapperRegistryImpl,
    })
  })

  it('omits one-time setup calls when resolver invariants are already satisfied', async () => {
    const plan = await buildPlan({
      classified: [
        makeName('alice.eth', { tokenType: 'unlocked' }),
        makeName('bob.eth'),
      ],
      resolverDeployed: true,
      walletCoAdminGranted: true,
    })
    const batch = plan.batches[0]
    assert(batch)

    expect(batch.innerExecutions.map((execution) => execution.phase)).toEqual([
      'migrate',
    ])
    expect(
      batch.verificationExpectations.map((expectation) => expectation.type),
    ).toEqual([
      'resolver-implementation',
      'resolver-root-roles',
      'wallet-name-roles',
      'name-owner',
      'name-resolver',
      'name-subregistry',
      'name-owner',
      'name-resolver',
      'name-subregistry',
    ])

    const helperExecution = batch.innerExecutions[0]
    assert(helperExecution)
    const decodedMigrate = decodeFunctionData({
      abi: MIGRATION_HELPER_ABI,
      data: helperExecution.call.data,
    })
    expect(decodedMigrate.args[0]).toEqual([
      expect.objectContaining({ label: 'bob', subregistry: zeroAddress }),
    ])
    expect(decodedMigrate.args[1]).toEqual([
      [expect.objectContaining({ label: 'alice', subregistry: zeroAddress })],
    ])
    expect(
      batch.verificationExpectations.filter(
        (expectation) => expectation.type === 'name-subregistry',
      ),
    ).toEqual([
      expect.objectContaining({
        name: 'alice.eth',
        expectedSubregistry: zeroAddress,
      }),
      expect.objectContaining({
        name: 'bob.eth',
        expectedSubregistry: zeroAddress,
      }),
    ])
  })

  it('splits only between complete name units using wrapped-call estimates', async () => {
    const estimateOuterGas = vi.fn(
      ({
        call,
        names,
      }: Parameters<
        NonNullable<
          Parameters<typeof buildAtomicMigrationBatches>[0]['estimateOuterGas']
        >
      >[0]) => {
        expect(call.to).toBe(HCA)
        expect(decodeOwnerExecutions(call.data)).not.toHaveLength(0)
        return BigInt(names.length) * 100n
      },
    )
    const classified = ['alice.eth', 'bob.eth', 'carol.eth'].map((name) =>
      makeName(name, {
        resolverStrategy: 'keep-v1',
        v1ResolverAddress: V1_RESOLVER,
      }),
    )

    const plan = await buildPlan({
      classified,
      maxOuterGas: 250n,
      estimateOuterGas,
    })

    expect(plan.batches.map((batch) => batch.names)).toEqual([
      ['alice.eth', 'bob.eth'],
      ['carol.eth'],
    ])
    expect(plan.batches.map((batch) => batch.estimatedGas)).toEqual([
      200n,
      100n,
    ])
    expect(
      plan.batches.flatMap((batch) =>
        batch.nameExecutions.map(
          (execution) => execution.classified.domain.name,
        ),
      ),
    ).toEqual(['alice.eth', 'bob.eth', 'carol.eth'])
  })

  it('splits a copy tree only after each node setup and registration unit', async () => {
    const root = makeName('example.eth', {
      action: 'migrate',
      tokenType: 'unwrapped',
      parentName: 'eth',
      label: 'example',
    })
    const foo = makeName('foo.example.eth', {
      action: 'copy',
      tokenType: 'unlocked-child',
      parentName: 'example.eth',
      label: 'foo',
      sourceExpiry: 2_000_000_000n,
    })
    const bar = makeName('bar.foo.example.eth', {
      action: 'copy',
      tokenType: 'registry-child',
      parentName: 'foo.example.eth',
      label: 'bar',
      sourceExpiry: (1n << 64n) - 1n,
    })
    const estimateOuterGas = vi.fn(
      ({ names }: { names: readonly string[] }) => BigInt(names.length) * 100n,
    )

    const plan = await buildPlan({
      classified: [bar, root, foo],
      resolverDeployed: true,
      walletCoAdminGranted: true,
      maxOuterGas: 200n,
      estimateOuterGas,
    })

    expect(plan.batches.map(({ names }) => names)).toEqual([
      ['example.eth', 'foo.example.eth'],
      ['bar.foo.example.eth'],
    ])
    expect(plan.batches.map(({ operations }) => operations)).toEqual([
      [
        { name: 'example.eth', action: 'migrate' },
        { name: 'foo.example.eth', action: 'copy' },
      ],
      [{ name: 'bar.foo.example.eth', action: 'copy' }],
    ])
    expect(
      plan.batches.map((batch) =>
        batch.innerExecutions.map(({ phase, name }) => ({ phase, name })),
      ),
    ).toEqual([
      [
        { phase: 'user-registry-deployment', name: 'example.eth' },
        { phase: 'user-registry-deployment', name: 'foo.example.eth' },
        { phase: 'user-registry-wallet-grant', name: 'example.eth' },
        { phase: 'user-registry-wallet-grant', name: 'foo.example.eth' },
        { phase: 'user-registry-parent', name: 'example.eth' },
        { phase: 'user-registry-parent', name: 'foo.example.eth' },
        { phase: 'migrate', name: 'example.eth' },
        { phase: 'copy-register', name: 'foo.example.eth' },
      ],
      [{ phase: 'copy-register', name: 'bar.foo.example.eth' }],
    ])
    expect(
      plan.batches.flatMap((batch) =>
        batch.innerExecutions.filter(
          ({ call }) =>
            call.to.toLowerCase() ===
            V2_CONTRACTS.MigrationHelper.toLowerCase(),
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        phase: 'migrate',
        names: ['example.eth'],
      }),
    ])

    for (const batch of plan.batches) {
      expect(decodeOwnerExecutions(batch.outerCall.data)).toHaveLength(
        batch.innerExecutions.length,
      )
    }
  })

  it('seeds execution from the preview boundary instead of estimating every prefix', async () => {
    const classified = Array.from({ length: 150 }, (_, index) =>
      makeName(`name-${index}.eth`, {
        resolverStrategy: 'keep-v1',
        v1ResolverAddress: V1_RESOLVER,
      }),
    )
    const estimatedSizes: number[] = []

    const plan = await buildPlan({
      classified,
      maxOuterGas: 9_000n,
      firstBatchOnly: true,
      initialBatchSize: 90,
      estimateOuterGas: ({ names }) => {
        estimatedSizes.push(names.length)
        return BigInt(names.length) * 100n
      },
    })

    expect(plan.batches).toHaveLength(1)
    expect(plan.batches[0]?.names).toHaveLength(90)
    expect(plan.batches[0]?.estimatedGas).toBe(9_000n)
    expect(estimatedSizes).toEqual([90])
  })

  it('propagates a preview estimate failure without replaying every prefix', async () => {
    const classified = Array.from({ length: 120 }, (_, index) =>
      makeName(`name-${index}.eth`, {
        resolverStrategy: 'keep-v1',
        v1ResolverAddress: V1_RESOLVER,
      }),
    )
    const estimateOuterGas = vi.fn(
      ({ names }: { names: readonly string[] }) => {
        if (names.length > 38) {
          throw new Error(
            'ERC1155: transfer to non ERC1155Receiver implementer',
          )
        }
        return BigInt(names.length) * 100n
      },
    )

    await expect(
      buildPlan({
        classified,
        maxOuterGas: 20_000n,
        firstBatchOnly: true,
        initialBatchSize: 90,
        estimateOuterGas,
      }),
    ).rejects.toThrow('ERC1155: transfer to non ERC1155Receiver implementer')

    expect(
      estimateOuterGas.mock.calls.map(([{ names }]) => names.length),
    ).toEqual([90])
  })

  it('does not split unrelated estimate failures', async () => {
    const estimateOuterGas = vi.fn((_input: { names: readonly string[] }) => {
      throw new Error('permission missing')
    })

    await expect(
      buildPlan({
        classified: [makeName('alice.eth'), makeName('bob.eth')],
        firstBatchOnly: true,
        initialBatchSize: 2,
        estimateOuterGas,
      }),
    ).rejects.toThrow('permission missing')
    expect(
      estimateOuterGas.mock.calls.map(([{ names }]) => names.length),
    ).toEqual([2])
  })

  it('keeps an 85-name migration batched while splitting an oversized live estimate', async () => {
    const classified = Array.from({ length: 85 }, (_, index) =>
      makeName(`name-${index}.eth`, {
        resolverStrategy: 'keep-v1',
        v1ResolverAddress: V1_RESOLVER,
      }),
    )
    const first = await buildPlan({
      classified,
      maxOuterGas: TARGET_GAS,
      firstBatchOnly: true,
      initialBatchSize: 85,
      estimateOuterGas: ({ names }) => BigInt(names.length) * 300_000n,
    })
    const firstBatch = first.batches[0]
    assert(firstBatch)
    expect(firstBatch.names).toHaveLength(50)
    expect(firstBatch.estimatedGas).toBe(15_000_000n)

    const remaining = classified.filter(
      ({ domain }) => !firstBatch.names.includes(domain.name),
    )
    const second = await buildPlan({
      classified: remaining,
      maxOuterGas: TARGET_GAS,
      firstBatchOnly: true,
      initialBatchSize: remaining.length,
      estimateOuterGas: ({ names }) => BigInt(names.length) * 300_000n,
    })
    expect(second.batches[0]?.names).toHaveLength(35)
    expect([...firstBatch.names, ...(second.batches[0]?.names ?? [])]).toEqual(
      classified.map(({ domain }) => domain.name),
    )
  })

  it('uses a bounded downward search when the preview exceeds the live limit', async () => {
    const classified = Array.from({ length: 120 }, (_, index) =>
      makeName(`name-${index}.eth`, {
        resolverStrategy: 'keep-v1',
        v1ResolverAddress: V1_RESOLVER,
      }),
    )
    const estimatedSizes: number[] = []

    const plan = await buildPlan({
      classified,
      maxOuterGas: 6_500n,
      firstBatchOnly: true,
      initialBatchSize: 90,
      estimateOuterGas: ({ names }) => {
        estimatedSizes.push(names.length)
        return BigInt(names.length) * 100n
      },
    })

    expect(plan.batches[0]?.names).toHaveLength(65)
    expect(plan.batches[0]?.estimatedGas).toBe(6_500n)
    expect(estimatedSizes.length).toBeLessThanOrEqual(9)
    expect(estimatedSizes[0]).toBe(90)
  })

  it('surfaces an estimate failure when one name cannot simulate', async () => {
    const estimateOuterGas = vi.fn(() => {
      throw new Error('ERC1155: transfer to non ERC1155Receiver implementer')
    })

    await expect(
      buildPlan({
        classified: [makeName('alice.eth')],
        firstBatchOnly: true,
        initialBatchSize: 1,
        estimateOuterGas,
      }),
    ).rejects.toThrow('ERC1155: transfer to non ERC1155Receiver implementer')
    expect(estimateOuterGas).toHaveBeenCalledOnce()
  })

  it('rebuilds the helper groups after retry removes a name', async () => {
    const plan = await buildPlan({
      classified: [
        makeName('alice.eth', { tokenType: 'unlocked' }),
        makeName('bob.eth', { tokenType: 'unlocked' }),
      ],
      resolverDeployed: true,
      walletCoAdminGranted: true,
    })
    const batch = plan.batches[0]
    assert(batch)

    const [groupedMigration] = batch.innerExecutions
    assert(groupedMigration)
    expect(groupedMigration.names).toEqual(['alice.eth', 'bob.eth'])
    expect(
      decodeFunctionData({
        abi: MIGRATION_HELPER_ABI,
        data: groupedMigration.call.data,
      }).functionName,
    ).toBe('migrate')

    const bobExecution = batch.nameExecutions.find(
      (execution) => execution.classified.domain.name === 'bob.eth',
    )
    assert(bobExecution)
    const [retryMigration] = buildAtomicMigrationInnerExecutions({
      nameExecutions: [bobExecution],
    })
    assert(retryMigration)
    expect(retryMigration.names).toEqual(['bob.eth'])
    expect(
      decodeFunctionData({
        abi: MIGRATION_HELPER_ABI,
        data: retryMigration.call.data,
      }).functionName,
    ).toBe('migrate')
  })

  it('blocks a single name whose wrapped execution exceeds the limit', async () => {
    const promise = buildPlan({
      classified: [makeName('oversized.eth')],
      maxOuterGas: 499n,
      estimateOuterGas: () => 500n,
    })

    await expect(promise).rejects.toMatchObject({
      name: 'AtomicMigrationNameGasLimitExceededError',
      ensName: 'oversized.eth',
      estimatedGas: 500n,
      maxOuterGas: 499n,
    })
    await expect(promise).rejects.toBeInstanceOf(
      AtomicMigrationNameGasLimitExceededError,
    )
  })
})
