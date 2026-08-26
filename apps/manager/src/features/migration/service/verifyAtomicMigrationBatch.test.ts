import type { Address, Hex, PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import type { AtomicMigrationVerificationExpectation } from './buildAtomicMigrationBatches'
import {
  AtomicMigrationBatchReconciliationIndeterminateError,
  AtomicMigrationBatchVerificationError,
  reconcileAtomicMigrationBatch,
  verifyAtomicMigrationBatch,
} from './verifyAtomicMigrationBatch'

const ROOT_REGISTRY: Address = '0x0000000000000000000000000000000000000010'
const PARENT_REGISTRY: Address = '0x0000000000000000000000000000000000000011'
const MID_REGISTRY: Address = '0x0000000000000000000000000000000000000012'
const WRAPPER_REGISTRY: Address = '0x0000000000000000000000000000000000000013'
const USER_REGISTRY: Address = '0x0000000000000000000000000000000000000014'
const FACTORY: Address = '0x0000000000000000000000000000000000000020'
const RESOLVER: Address = '0x0000000000000000000000000000000000000021'
const RESOLVER_IMPLEMENTATION: Address =
  '0x0000000000000000000000000000000000000022'
const WRAPPER_IMPLEMENTATION: Address =
  '0x0000000000000000000000000000000000000023'
const USER_REGISTRY_IMPLEMENTATION: Address =
  '0x0000000000000000000000000000000000000024'
const HCA: Address = '0x0000000000000000000000000000000000000030'
const WALLET: Address = '0x0000000000000000000000000000000000000031'
const MANAGER: Address = '0x0000000000000000000000000000000000000032'
const NODE = `0x${'ab'.repeat(32)}` as Hex
const RECORD_VALUE = '0x1234' as Hex
const CONTENT_HASH = '0xe301' as Hex
const ABI_VALUE = '0x5b5d' as Hex
const RESOURCE = 123n
const EXPIRY = 4_294_967_295n
const ROLES_ALL = (1n << 256n) - 1n
// RegistryRolesLib uses nybble-packed roles: SET_RESOLVER is the seventh
// nybble, not the seventh contiguous bit.
const ROLE_SET_RESOLVER = 1n << 24n

const expectations = [
  {
    id: 'resolver:implementation',
    type: 'resolver-implementation',
    name: 'leaf.mid.parent.eth',
    resolver: RESOLVER,
    factory: FACTORY,
    expectedImplementation: RESOLVER_IMPLEMENTATION,
    deployer: HCA,
    salt: 0n,
  },
  {
    id: 'resolver:hca-roles',
    type: 'resolver-root-roles',
    name: 'leaf.mid.parent.eth',
    resolver: RESOLVER,
    account: HCA,
    rootName: '0x00',
    roleBitmap: ROLES_ALL,
  },
  {
    id: 'resolver:wallet-roles',
    type: 'wallet-name-roles',
    name: 'leaf.mid.parent.eth',
    resolver: RESOLVER,
    account: WALLET,
    rootName: '0x00',
    roleBitmap: ROLES_ALL,
  },
  {
    id: 'name:owner',
    type: 'name-owner',
    name: 'leaf.mid.parent.eth',
    label: 'leaf',
    node: NODE,
    resource: RESOURCE,
    tokenType: 'locked-child',
    registryPath: {
      type: 'parent-subregistry',
      rootRegistry: ROOT_REGISTRY,
      parentName: 'mid.parent.eth',
      parentLabels: ['parent', 'mid'],
      label: 'leaf',
      resource: RESOURCE,
    },
    expectedOwner: WALLET,
  },
  {
    id: 'name:resolver',
    type: 'name-resolver',
    name: 'leaf.mid.parent.eth',
    label: 'leaf',
    node: NODE,
    resource: RESOURCE,
    registryPath: {
      type: 'parent-subregistry',
      rootRegistry: ROOT_REGISTRY,
      parentName: 'mid.parent.eth',
      parentLabels: ['parent', 'mid'],
      label: 'leaf',
      resource: RESOURCE,
    },
    expectedResolver: RESOLVER,
  },
  {
    id: 'name:owner-roles',
    type: 'name-owner-roles',
    name: 'leaf.mid.parent.eth',
    registryPath: {
      type: 'parent-subregistry',
      rootRegistry: ROOT_REGISTRY,
      parentName: 'mid.parent.eth',
      parentLabels: ['parent', 'mid'],
      label: 'leaf',
      resource: RESOURCE,
    },
    resource: RESOURCE,
    account: WALLET,
    roleBitmap: ROLE_SET_RESOLVER,
  },
  {
    id: 'name:wrapper',
    type: 'wrapper-subregistry',
    name: 'leaf.mid.parent.eth',
    node: NODE,
    label: 'leaf',
    registryPath: {
      type: 'parent-subregistry',
      rootRegistry: ROOT_REGISTRY,
      parentName: 'mid.parent.eth',
      parentLabels: ['parent', 'mid'],
      label: 'leaf',
      resource: RESOURCE,
    },
    factory: FACTORY,
    expectedImplementation: WRAPPER_IMPLEMENTATION,
    expectedWrapperRegistry: WRAPPER_REGISTRY,
  },
  {
    id: 'name:wrapper-root-roles',
    type: 'wrapper-root-roles',
    name: 'leaf.mid.parent.eth',
    label: 'leaf',
    registryPath: {
      type: 'parent-subregistry',
      rootRegistry: ROOT_REGISTRY,
      parentName: 'mid.parent.eth',
      parentLabels: ['parent', 'mid'],
      label: 'leaf',
      resource: RESOURCE,
    },
    resource: 0n,
    account: WALLET,
    roleBitmap: ROLE_SET_RESOLVER,
  },
  {
    id: 'name:manager',
    type: 'manager-role',
    name: 'leaf.mid.parent.eth',
    label: 'leaf',
    registry: ROOT_REGISTRY,
    resource: RESOURCE,
    account: MANAGER,
    roleBitmap: ROLE_SET_RESOLVER,
  },
  {
    id: 'profile:text',
    type: 'profile-text',
    name: 'leaf.mid.parent.eth',
    node: NODE,
    resolver: RESOLVER,
    key: 'com.example',
    value: 'expected text',
  },
  {
    id: 'profile:address',
    type: 'profile-address',
    name: 'leaf.mid.parent.eth',
    node: NODE,
    resolver: RESOLVER,
    coinType: 60n,
    value: RECORD_VALUE,
  },
  {
    id: 'profile:contenthash',
    type: 'profile-contenthash',
    name: 'leaf.mid.parent.eth',
    node: NODE,
    resolver: RESOLVER,
    value: CONTENT_HASH,
  },
  {
    id: 'profile:abi',
    type: 'profile-abi',
    name: 'leaf.mid.parent.eth',
    node: NODE,
    resolver: RESOLVER,
    contentType: 1n,
    value: ABI_VALUE,
  },
] as const satisfies readonly AtomicMigrationVerificationExpectation[]

const copiedNameRegistryPath = {
  type: 'parent-subregistry',
  rootRegistry: ROOT_REGISTRY,
  parentName: 'parent.eth',
  parentLabels: ['parent'],
  label: 'foo',
  resource: RESOURCE,
} as const

const copyExpectations = [
  {
    id: 'copy:user-registry-implementation',
    type: 'user-registry-implementation',
    name: 'foo.parent.eth',
    registry: USER_REGISTRY,
    factory: FACTORY,
    expectedImplementation: USER_REGISTRY_IMPLEMENTATION,
    deployer: HCA,
    salt: 1n,
  },
  {
    id: 'copy:user-registry-hca-roles',
    type: 'user-registry-root-roles',
    name: 'foo.parent.eth',
    registry: USER_REGISTRY,
    account: HCA,
    roleBitmap: ROLES_ALL,
  },
  {
    id: 'copy:user-registry-wallet-roles',
    type: 'user-registry-root-roles',
    name: 'foo.parent.eth',
    registry: USER_REGISTRY,
    account: WALLET,
    roleBitmap: ROLES_ALL,
  },
  {
    id: 'copy:user-registry-parent',
    type: 'user-registry-parent',
    name: 'foo.parent.eth',
    registry: USER_REGISTRY,
    expectedParentRegistry: PARENT_REGISTRY,
    expectedParentLabel: 'foo',
  },
  {
    id: 'copy:name-subregistry',
    type: 'name-subregistry',
    name: 'foo.parent.eth',
    label: 'foo',
    registryPath: copiedNameRegistryPath,
    expectedSubregistry: USER_REGISTRY,
  },
  {
    id: 'copy:name-expiry',
    type: 'name-expiry',
    name: 'foo.parent.eth',
    registryPath: copiedNameRegistryPath,
    resource: RESOURCE,
    expectedExpiry: EXPIRY,
  },
] as const satisfies readonly AtomicMigrationVerificationExpectation[]

type ReadRequest = {
  readonly address: Address
  readonly functionName: string
  readonly args?: readonly unknown[]
  readonly blockNumber?: bigint
}

const readSubregistryFixture = (request: ReadRequest): Address => {
  const registryByRead = new Map<string, Address>([
    [`${ROOT_REGISTRY}:parent`, PARENT_REGISTRY],
    [`${PARENT_REGISTRY}:mid`, MID_REGISTRY],
    [`${MID_REGISTRY}:leaf`, WRAPPER_REGISTRY],
  ])
  const subregistry = registryByRead.get(
    `${request.address}:${String(request.args?.[0])}`,
  )
  if (!subregistry) throw new Error('unexpected subregistry read')
  return subregistry
}

describe('verifyAtomicMigrationBatch', () => {
  it('checks every expected state and traverses parent subregistries root-to-leaf', async () => {
    const readContract = vi.fn(async (request: ReadRequest) => {
      if (request.functionName === 'verifyContract') {
        return request.args?.[0] === WRAPPER_REGISTRY
          ? WRAPPER_IMPLEMENTATION
          : RESOLVER_IMPLEMENTATION
      }
      if (request.functionName === 'getSubregistry') {
        return readSubregistryFixture(request)
      }
      const resultByFunction: Readonly<Record<string, unknown>> = {
        hasRootRoles: true,
        getOwner: WALLET,
        getResolver: RESOLVER,
        hasRoles: true,
        getWrappedNode: NODE,
        text: 'expected text',
        addr: RECORD_VALUE,
        contenthash: CONTENT_HASH,
        ABI: [1n, ABI_VALUE],
      }
      if (request.functionName in resultByFunction) {
        return resultByFunction[request.functionName]
      }
      throw new Error(`unexpected read: ${request.functionName}`)
    })
    const publicClient = {
      getCode: vi.fn(() => Promise.resolve('0x01')),
      readContract,
    } as unknown as PublicClient

    await expect(
      verifyAtomicMigrationBatch({
        publicClient,
        batch: { index: 7, verificationExpectations: expectations },
        blockNumber: 456n,
      }),
    ).resolves.toEqual({
      batchIndex: 7,
      status: 'confirmed',
      results: expectations.map(({ id }) => ({
        expectationId: id,
        satisfied: true,
      })),
    })

    const requests = readContract.mock.calls.map(([request]) => request)
    expect(
      requests
        .filter(({ functionName }) => functionName === 'getSubregistry')
        .map(({ address, args }) => ({ address, args })),
    ).toEqual([
      { address: ROOT_REGISTRY, args: ['parent'] },
      { address: PARENT_REGISTRY, args: ['mid'] },
      { address: MID_REGISTRY, args: ['leaf'] },
    ])
    expect(requests.some(({ args }) => args?.includes('eth'))).toBe(false)
    expect(requests).toContainEqual(
      expect.objectContaining({
        address: MID_REGISTRY,
        functionName: 'getOwner',
        args: [RESOURCE],
      }),
    )
    expect(requests).toContainEqual(
      expect.objectContaining({
        address: MID_REGISTRY,
        functionName: 'hasRoles',
        args: [RESOURCE, ROLE_SET_RESOLVER, WALLET],
      }),
    )
    expect(requests).toContainEqual(
      expect.objectContaining({
        address: WRAPPER_REGISTRY,
        functionName: 'getWrappedNode',
      }),
    )
    expect(requests).toContainEqual(
      expect.objectContaining({
        address: WRAPPER_REGISTRY,
        functionName: 'hasRoles',
        args: [0n, ROLE_SET_RESOLVER, WALLET],
      }),
    )
    expect(requests).toContainEqual(
      expect.objectContaining({
        address: MID_REGISTRY,
        functionName: 'hasRoles',
        args: [RESOURCE, ROLE_SET_RESOLVER, MANAGER],
      }),
    )
    expect(requests.every(({ blockNumber }) => blockNumber === 456n)).toBe(true)
  })

  it('attempts every check and fails closed with a complete result set', async () => {
    const readFailure = new Error('RPC unavailable')
    const failingExpectations = [
      expectations[3],
      expectations[9],
      expectations[10],
    ] as const
    const readContract = vi.fn(async (request: ReadRequest) => {
      switch (request.functionName) {
        case 'getSubregistry':
          return request.address === ROOT_REGISTRY
            ? PARENT_REGISTRY
            : MID_REGISTRY
        case 'getOwner':
          return WALLET
        case 'text':
          return 'different text'
        case 'addr':
          throw readFailure
        default:
          throw new Error(`unexpected read: ${request.functionName}`)
      }
    })
    const publicClient = {
      getCode: vi.fn(() => Promise.resolve('0x01')),
      readContract,
    } as unknown as PublicClient

    const error = await verifyAtomicMigrationBatch({
      publicClient,
      batch: { index: 8, verificationExpectations: failingExpectations },
    }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(AtomicMigrationBatchVerificationError)
    expect(error).toMatchObject({
      batchIndex: 8,
      verification: {
        batchIndex: 8,
        status: 'confirmed',
        results: [
          { expectationId: 'name:owner', satisfied: true },
          { expectationId: 'profile:text', satisfied: false },
          { expectationId: 'profile:address', satisfied: false },
        ],
      },
      failures: [
        { expectationId: 'profile:text' },
        { expectationId: 'profile:address', cause: readFailure },
      ],
    })
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'getOwner' }),
    )
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'text' }),
    )
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'addr' }),
    )
  })

  it('rejects a bound subregistry that is not the certified WrapperRegistry implementation', async () => {
    const wrapperExpectation = expectations[6]
    const readContract = vi.fn(async (request: ReadRequest) => {
      switch (request.functionName) {
        case 'getSubregistry':
          if (request.address === ROOT_REGISTRY) return PARENT_REGISTRY
          if (request.address === PARENT_REGISTRY) return MID_REGISTRY
          return WRAPPER_REGISTRY
        case 'verifyContract':
          return RESOLVER_IMPLEMENTATION
        case 'getWrappedNode':
          return NODE
        default:
          throw new Error(`unexpected read: ${request.functionName}`)
      }
    })
    const publicClient = {
      getCode: vi.fn(() => Promise.resolve('0x01')),
      readContract,
    } as unknown as PublicClient

    const error = await verifyAtomicMigrationBatch({
      publicClient,
      batch: { index: 9, verificationExpectations: [wrapperExpectation] },
    }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(AtomicMigrationBatchVerificationError)
    expect(error).toMatchObject({
      failures: [{ expectationId: 'name:wrapper' }],
      verification: {
        results: [{ expectationId: 'name:wrapper', satisfied: false }],
      },
    })
  })

  it('verifies copied-name UserRegistry state and exact active expiry at the receipt block', async () => {
    const readContract = vi.fn(async (request: ReadRequest) => {
      switch (request.functionName) {
        case 'verifyContract':
          return USER_REGISTRY_IMPLEMENTATION
        case 'hasRootRoles':
          return true
        case 'getParent':
          return [PARENT_REGISTRY, 'foo'] as const
        case 'getSubregistry':
          if (request.address === ROOT_REGISTRY) return PARENT_REGISTRY
          if (request.address === PARENT_REGISTRY) return USER_REGISTRY
          throw new Error('unexpected subregistry read')
        case 'getState':
          return {
            status: 2,
            expiry: EXPIRY,
            latestOwner: WALLET,
            tokenId: 1n,
            resource: RESOURCE,
          }
        default:
          throw new Error(`unexpected read: ${request.functionName}`)
      }
    })
    const getCode = vi.fn(() => Promise.resolve('0x01' as const))
    const publicClient = { getCode, readContract } as unknown as PublicClient

    await expect(
      verifyAtomicMigrationBatch({
        publicClient,
        batch: { index: 10, verificationExpectations: copyExpectations },
        blockNumber: 789n,
      }),
    ).resolves.toEqual({
      batchIndex: 10,
      status: 'confirmed',
      results: copyExpectations.map(({ id }) => ({
        expectationId: id,
        satisfied: true,
      })),
    })

    expect(getCode).toHaveBeenCalledTimes(1)
    expect(getCode).toHaveBeenCalledWith({
      address: USER_REGISTRY,
      blockNumber: 789n,
    })
    expect(
      readContract.mock.calls.map(([request]) => request.functionName).sort(),
    ).toEqual([
      'getParent',
      'getState',
      'getSubregistry',
      'getSubregistry',
      'hasRootRoles',
      'hasRootRoles',
      'verifyContract',
    ])
    expect(
      readContract.mock.calls.every(
        ([request]) => request.blockNumber === 789n,
      ),
    ).toBe(true)
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: FACTORY,
        args: [USER_REGISTRY],
      }),
    )
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: PARENT_REGISTRY,
        functionName: 'getState',
        args: [RESOURCE],
      }),
    )
  })

  it('rejects an uncertified deterministic UserRegistry implementation', async () => {
    const readContract = vi.fn(() => Promise.resolve(WRAPPER_IMPLEMENTATION))
    const publicClient = {
      getCode: vi.fn(() => Promise.resolve('0x01')),
      readContract,
    } as unknown as PublicClient

    const error = await verifyAtomicMigrationBatch({
      publicClient,
      batch: {
        index: 11,
        verificationExpectations: [copyExpectations[0]],
      },
    }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(AtomicMigrationBatchVerificationError)
    expect(error).toMatchObject({
      failures: [{ expectationId: 'copy:user-registry-implementation' }],
    })
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: FACTORY,
        functionName: 'verifyContract',
        args: [USER_REGISTRY],
      }),
    )
  })

  it('rejects mismatched UserRegistry parent, subregistry pointer, and inactive name state', async () => {
    const checkedExpectations = [
      copyExpectations[3],
      copyExpectations[4],
      copyExpectations[5],
    ] as const
    const readContract = vi.fn(async (request: ReadRequest) => {
      switch (request.functionName) {
        case 'getParent':
          return [ROOT_REGISTRY, 'wrong-label'] as const
        case 'getSubregistry':
          if (request.address === ROOT_REGISTRY) return PARENT_REGISTRY
          return WRAPPER_REGISTRY
        case 'getState':
          return {
            status: 1,
            expiry: EXPIRY,
            latestOwner: WALLET,
            tokenId: 1n,
            resource: RESOURCE,
          }
        default:
          throw new Error(`unexpected read: ${request.functionName}`)
      }
    })
    const publicClient = {
      getCode: vi.fn(() => Promise.resolve('0x01')),
      readContract,
    } as unknown as PublicClient

    const error = await verifyAtomicMigrationBatch({
      publicClient,
      batch: { index: 12, verificationExpectations: checkedExpectations },
    }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(AtomicMigrationBatchVerificationError)
    expect(error).toMatchObject({
      failures: [
        { expectationId: 'copy:user-registry-parent' },
        { expectationId: 'copy:name-subregistry' },
        { expectationId: 'copy:name-expiry' },
      ],
    })
  })

  it.each([
    ['expiry', { status: 2, expiry: EXPIRY + 1n, resource: RESOURCE }],
    ['resource', { status: 2, expiry: EXPIRY, resource: RESOURCE + 1n }],
  ] as const)('rejects a copied name with a mismatched %s in getState', async (_field, state) => {
    const readContract = vi.fn((request: ReadRequest) => {
      if (request.functionName === 'getSubregistry') {
        return Promise.resolve(PARENT_REGISTRY)
      }
      if (request.functionName === 'getState') {
        return Promise.resolve({
          ...state,
          latestOwner: WALLET,
          tokenId: 1n,
        })
      }
      return Promise.reject(
        new Error(`unexpected read: ${request.functionName}`),
      )
    })
    const publicClient = { readContract } as unknown as PublicClient

    const error = await verifyAtomicMigrationBatch({
      publicClient,
      batch: {
        index: 13,
        verificationExpectations: [copyExpectations[5]],
      },
    }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(AtomicMigrationBatchVerificationError)
    expect(error).toMatchObject({
      failures: [{ expectationId: 'copy:name-expiry' }],
    })
  })
})

describe('reconcileAtomicMigrationBatch', () => {
  it('classifies returned post-state mismatches as incomplete', async () => {
    const publicClient = {
      readContract: vi.fn(() => Promise.resolve(HCA)),
    } as unknown as PublicClient

    await expect(
      reconcileAtomicMigrationBatch({
        publicClient,
        batch: {
          index: 9,
          verificationExpectations: [expectations[3]],
        },
      }),
    ).resolves.toMatchObject({
      status: 'incomplete',
      mismatches: [{ expectationId: 'name:owner' }],
    })
  })

  it('classifies a missing on-chain subregistry as a deterministic mismatch', async () => {
    const publicClient = {
      readContract: vi.fn(() =>
        Promise.resolve('0x0000000000000000000000000000000000000000'),
      ),
    } as unknown as PublicClient

    await expect(
      reconcileAtomicMigrationBatch({
        publicClient,
        batch: {
          index: 10,
          verificationExpectations: [expectations[3]],
        },
      }),
    ).resolves.toMatchObject({
      status: 'incomplete',
      mismatches: [{ expectationId: 'name:owner' }],
    })
  })

  it('classifies a missing locked-name WrapperRegistry as a deterministic mismatch', async () => {
    const publicClient = {
      readContract: vi.fn((request: ReadRequest) => {
        if (request.address === ROOT_REGISTRY) {
          return Promise.resolve(PARENT_REGISTRY)
        }
        if (request.address === PARENT_REGISTRY) {
          return Promise.resolve(MID_REGISTRY)
        }
        return Promise.resolve('0x0000000000000000000000000000000000000000')
      }),
    } as unknown as PublicClient

    await expect(
      reconcileAtomicMigrationBatch({
        publicClient,
        batch: {
          index: 11,
          verificationExpectations: [expectations[6]],
        },
      }),
    ).resolves.toMatchObject({
      status: 'incomplete',
      mismatches: [{ expectationId: 'name:wrapper' }],
    })
  })

  it('classifies an undeployed deterministic resolver as incomplete', async () => {
    const readContract = vi.fn()
    const publicClient = {
      getCode: vi.fn(() => Promise.resolve('0x')),
      readContract,
    } as unknown as PublicClient

    await expect(
      reconcileAtomicMigrationBatch({
        publicClient,
        batch: {
          index: 12,
          verificationExpectations: [expectations[0], expectations[9]],
        },
      }),
    ).resolves.toMatchObject({
      status: 'incomplete',
      mismatches: [
        { expectationId: 'resolver:implementation' },
        { expectationId: 'profile:text' },
      ],
    })
    expect(readContract).not.toHaveBeenCalled()
  })

  it('fails closed when an expectation read is indeterminate', async () => {
    const readFailure = new Error('RPC unavailable')
    const publicClient = {
      readContract: vi.fn(() => Promise.reject(readFailure)),
    } as unknown as PublicClient

    const error = await reconcileAtomicMigrationBatch({
      publicClient,
      batch: {
        index: 13,
        verificationExpectations: [expectations[3]],
      },
    }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(
      AtomicMigrationBatchReconciliationIndeterminateError,
    )
    expect(error).toMatchObject({
      batchIndex: 13,
      readFailures: [{ expectationId: 'name:owner', cause: readFailure }],
    })
  })
})
