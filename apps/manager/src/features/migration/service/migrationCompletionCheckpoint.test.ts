import {
  buildHcaOwnerExecutionCall,
  getDestinationContracts,
} from '@ens-apps/smart-account'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { Storage } from 'happy-dom'
import { type Address, type Hex, type PublicClient, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMigrationHelperCall } from './buildMigrationHelperCall'
import { createMigrationData } from './encodeMigration'
import {
  persistMigrationCompletionCheckpoint,
  restoreMigrationCompletionCheckpoint,
  verifyAndPersistMigrationCompletionCheckpoint,
} from './migrationCompletionCheckpoint'
import {
  buildRegisterCopiedSubnameCall,
  computeUserRegistryAddress,
} from './userRegistryMigration'

const owner = '0x0000000000000000000000000000000000000001' as Address
const hca = '0x0000000000000000000000000000000000000002' as Address
const other = '0x0000000000000000000000000000000000000003' as Address
const registry = computeUserRegistryAddress({ hca, parentName: 'alice.eth' })
const hash = `0x${'1'.repeat(64)}` as Hex
const blockHash = `0x${'2'.repeat(64)}` as Hex
const scope = { chainId: sepolia.id, owner, hca }
const contracts = getDestinationContracts(sepolia.id)
const operation = { name: 'alice.eth', action: 'migrate' as const }
const receipt = {
  status: 'success',
  transactionHash: hash,
  blockNumber: 123n,
  blockHash,
  from: owner,
  to: hca,
}
const directCall = () =>
  buildMigrationHelperCall([
    {
      name: 'alice.eth',
      tokenType: 'unwrapped',
      parentName: 'eth',
      data: createMigrationData({ label: 'alice', owner, resolver: other }),
    },
  ])
const outer = (call = directCall()) =>
  buildHcaOwnerExecutionCall({ hca, calls: [call] }).data
const transaction = () => ({
  hash,
  from: owner,
  to: hca,
  blockNumber: 123n,
  blockHash,
  input: outer(),
})
const getReceipt = vi.fn()
const getTransaction = vi.fn()
const readContract = vi.fn()
const publicClient = {
  chain: { id: sepolia.id },
  getTransactionReceipt: getReceipt,
  getTransaction,
  readContract,
} as unknown as PublicClient
let storage: Storage
const persist = () =>
  persistMigrationCompletionCheckpoint({
    scope,
    transactionHash: hash,
    operations: [operation],
    storage,
  })
const restore = (overrides = {}) =>
  restoreMigrationCompletionCheckpoint({
    scope,
    publicClient,
    storage,
    ...overrides,
  })

beforeEach(() => {
  vi.resetAllMocks()
  storage = new Storage()
  getReceipt.mockResolvedValue(receipt)
  getTransaction.mockResolvedValue(transaction())
  readContract.mockImplementation(({ functionName, args }) => {
    if (functionName === 'verifyContract')
      return Promise.resolve(
        args[0] === hca
          ? contracts.standaloneHcaImplementation
          : contracts.userRegistryImpl,
      )
    if (functionName === 'getSubregistry') return Promise.resolve(registry)
    return Promise.resolve(owner)
  })
})
afterEach(() => vi.useRealTimers())

describe('receipt-backed migration completion checkpoint', () => {
  it('stores only one operation and restores by verifying canonical historical state', async () => {
    persistMigrationCompletionCheckpoint({
      scope,
      transactionHash: hash,
      operations: [operation, { name: 'bob.eth', action: 'migrate' }],
      storage,
    })
    expect(storage.length).toBe(1)
    const stored = JSON.parse(storage.getItem(storage.key(0) ?? '') ?? '{}')
    expect(stored.operation).toEqual(operation)
    expect(stored.operations).toBeUndefined()
    await expect(restore()).resolves.toEqual(operation)
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: contracts.ethRegistry,
        functionName: 'getOwner',
        args: [labelToCanonicalId('alice')],
        blockNumber: 123n,
      }),
    )
    expect(
      readContract.mock.calls.every(([args]) => args.blockNumber === 123n),
    ).toBe(true)
  })

  it('does not invent evidence for an earlier session without a checkpoint', async () => {
    await expect(restore()).resolves.toBeNull()
    expect(getReceipt).not.toHaveBeenCalled()
  })

  it.each([
    { owner: other },
    { hca: other },
    { chainId: 1 },
  ])('keeps durable evidence scoped to %o', async (differentScope) => {
    persist()
    const nextScope = { ...scope, ...differentScope }
    await expect(
      restore({
        scope: nextScope,
        publicClient: { ...publicClient, chain: { id: nextScope.chainId } },
      }),
    ).resolves.toBeNull()
    expect(getReceipt).not.toHaveBeenCalled()
  })

  it.each([
    { version: 2 },
    { deployment: 'old deployment' },
    { transactionHash: 'not a hash' },
    { operation: { name: 'alice.eth', action: 'register' } },
    { operation: { name: '', action: 'migrate' } },
  ])('rejects malformed or another-deployment stored evidence %o', async (change) => {
    persist()
    const key = storage.key(0) ?? ''
    storage.setItem(
      key,
      JSON.stringify({
        ...JSON.parse(storage.getItem(key) ?? '{}'),
        ...change,
      }),
    )
    await expect(restore()).rejects.toThrow(
      'Invalid migration completion checkpoint',
    )
    expect(getReceipt).not.toHaveBeenCalled()
  })

  it.each([
    { status: 'reverted' },
    { from: other },
    { to: other },
    { blockHash: hash },
    { transactionHash: blockHash },
  ])('rejects an unrelated/reverted receipt %o', async (change) => {
    persist()
    getReceipt.mockResolvedValue({ ...receipt, ...change })
    await expect(restore()).rejects.toThrow('transaction does not match')
  })

  it.each([
    { from: other },
    { to: other },
    { hash: blockHash },
    { blockNumber: 124n },
  ])('rejects an unrelated transaction %o', async (change) => {
    persist()
    getTransaction.mockResolvedValue({ ...transaction(), ...change })
    await expect(restore()).rejects.toThrow('transaction does not match')
  })

  it.each([
    'owner',
    'authorizedOwnerOf',
    'verifyContract',
  ])('rejects an untrusted HCA %s', async (functionName) => {
    persist()
    const original = readContract.getMockImplementation()
    readContract.mockImplementation((args) =>
      args.functionName === functionName
        ? Promise.resolve(other)
        : original?.(args),
    )
    await expect(restore()).rejects.toThrow('HCA is invalid')
  })

  it('rejects an approval transaction even if the name is currently owned', async () => {
    persist()
    getTransaction.mockResolvedValue({
      ...transaction(),
      input: outer({ to: other, value: 0n, data: '0x1234' }),
    })
    await expect(restore()).rejects.toThrow('calldata does not upgrade')
  })

  it('rejects calldata that migrates a different name or recipient', async () => {
    persist()
    getTransaction.mockResolvedValue({
      ...transaction(),
      input: outer(
        buildMigrationHelperCall([
          {
            name: 'bob.eth',
            tokenType: 'unwrapped',
            parentName: 'eth',
            data: createMigrationData({ label: 'bob', owner, resolver: other }),
          },
        ]),
      ),
    })
    await expect(restore()).rejects.toThrow('calldata does not upgrade')
  })

  it('requires ownership at the receipt block', async () => {
    persist()
    const original = readContract.getMockImplementation()
    readContract.mockImplementation((args) =>
      args.functionName === 'getOwner'
        ? Promise.resolve(other)
        : original?.(args),
    )
    await expect(restore()).rejects.toThrow('name ownership is invalid')
  })

  it('restores copied children only through the canonical parent registry and matching register call', async () => {
    const copied = { name: 'child.alice.eth', action: 'copy' as const }
    persistMigrationCompletionCheckpoint({
      scope,
      transactionHash: hash,
      operations: [copied],
      storage,
    })
    const call = buildRegisterCopiedSubnameCall({
      registry,
      label: 'child',
      owner,
      childRegistry: zeroAddress,
      resolver: other,
      expiry: 12345n,
    })
    getTransaction.mockResolvedValue({ ...transaction(), input: outer(call) })
    await expect(restore()).resolves.toEqual(copied)
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: contracts.ethRegistry,
        functionName: 'getSubregistry',
        args: ['alice'],
        blockNumber: 123n,
      }),
    )
    getTransaction.mockResolvedValue({
      ...transaction(),
      input: outer({ ...call, to: other }),
    })
    await expect(restore()).rejects.toThrow('calldata does not upgrade')
  })

  it('validates the DNS parent in child migration calldata', async () => {
    const child = { name: 'child.alice.eth', action: 'migrate' as const }
    persistMigrationCompletionCheckpoint({
      scope,
      transactionHash: hash,
      operations: [child],
      storage,
    })
    const call = (parentName: string) =>
      buildMigrationHelperCall([
        {
          name: child.name,
          tokenType: 'locked-child',
          parentName,
          data: createMigrationData({ label: 'child', owner, resolver: other }),
        },
      ])
    getTransaction.mockResolvedValue({
      ...transaction(),
      input: outer(call('alice.eth')),
    })
    await expect(restore()).resolves.toEqual(child)
    getTransaction.mockResolvedValue({
      ...transaction(),
      input: outer(call('bob.eth')),
    })
    await expect(restore()).rejects.toThrow('calldata does not upgrade')
  })

  it('bounds a hung receipt lookup and cancels restoration with its caller', async () => {
    vi.useFakeTimers()
    persist()
    getReceipt.mockReturnValue(new Promise(() => {}))
    const timedOut = expect(restore()).rejects.toThrow('Request timed out')
    await vi.advanceTimersByTimeAsync(15_000)
    await timedOut
    const controller = new AbortController()
    const aborted = expect(
      restore({ signal: controller.signal }),
    ).rejects.toThrow('Cancelled')
    controller.abort(new Error('Cancelled'))
    await aborted
    expect(readContract).not.toHaveBeenCalled()
  })
})

it('validates every operation from an older journal and shares receipt/HCA reads', async () => {
  const operations = [
    operation,
    { name: 'bob.eth', action: 'migrate' as const },
  ]
  const call = buildMigrationHelperCall(
    operations.map(({ name }) => ({
      name,
      tokenType: 'unwrapped',
      parentName: 'eth',
      data: createMigrationData({
        label: name.split('.')[0] ?? '',
        owner,
        resolver: other,
      }),
    })),
  )
  getTransaction.mockResolvedValue({ ...transaction(), input: outer(call) })
  await verifyAndPersistMigrationCompletionCheckpoint({
    scope,
    publicClient,
    transactionHash: hash,
    operations,
    storage,
  })
  expect(getReceipt).toHaveBeenCalledOnce()
  expect(getTransaction).toHaveBeenCalledOnce()
  expect(readContract).toHaveBeenCalledTimes(5)
  expect(storage.length).toBe(1)
})

it('keeps older multi-name journal evidence when any operation fails validation', async () => {
  await expect(
    verifyAndPersistMigrationCompletionCheckpoint({
      scope,
      publicClient,
      transactionHash: hash,
      operations: [operation, { name: 'bob.eth', action: 'migrate' }],
      storage,
    }),
  ).rejects.toThrow('calldata does not upgrade')
  expect(storage.length).toBe(0)
})

it('rejects substituting copy for migrate in stored operation evidence', async () => {
  persistMigrationCompletionCheckpoint({
    scope,
    transactionHash: hash,
    operations: [{ name: 'alice.eth', action: 'copy' }],
    storage,
  })
  await expect(restore()).rejects.toThrow('copy registry is invalid')
})

it('prefers direct migration evidence and preserves a verified direct checkpoint through later copies', () => {
  const copy = { name: 'child.alice.eth', action: 'copy' as const }
  persistMigrationCompletionCheckpoint({
    scope,
    transactionHash: hash,
    operations: [copy, operation],
    storage,
  })
  const key = storage.key(0) ?? ''
  const direct = storage.getItem(key)
  expect(JSON.parse(direct ?? '{}').operation).toEqual(operation)
  persistMigrationCompletionCheckpoint({
    scope,
    transactionHash: blockHash,
    operations: [copy],
    storage,
  })
  expect(storage.getItem(key)).toBe(direct)
})

it('does not let a forged prior migrate hint suppress a fresh verified copy checkpoint', () => {
  persist()
  const key = storage.key(0) ?? ''
  const previous = JSON.parse(storage.getItem(key) ?? '{}')
  storage.setItem(
    key,
    JSON.stringify({ ...previous, transactionHash: blockHash }),
  )
  const copy = { name: 'child.alice.eth', action: 'copy' as const }
  persistMigrationCompletionCheckpoint({
    scope,
    transactionHash: hash,
    operations: [copy],
    storage,
  })
  expect(JSON.parse(storage.getItem(key) ?? '{}').operation).toEqual(copy)
})

it('rejects a copied-name proof through an arbitrary canonical registry', async () => {
  const copy = { name: 'child.alice.eth', action: 'copy' as const }
  persistMigrationCompletionCheckpoint({
    scope,
    transactionHash: hash,
    operations: [copy],
    storage,
  })
  const original = readContract.getMockImplementation()
  readContract.mockImplementation((args) =>
    args.functionName === 'getSubregistry'
      ? Promise.resolve(other)
      : original?.(args),
  )
  getTransaction.mockResolvedValue({
    ...transaction(),
    input: outer(
      buildRegisterCopiedSubnameCall({
        registry: other,
        label: 'child',
        owner,
        childRegistry: zeroAddress,
        resolver: other,
        expiry: 12345n,
      }),
    ),
  })
  await expect(restore()).rejects.toThrow('copy registry is invalid')
})
