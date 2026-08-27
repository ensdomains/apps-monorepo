import type { Address, PublicClient, WalletClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { startTransaction: vi.fn(() => 'tx-bundle') },
  waitForTransaction: vi.fn(async () => ({ hash: '0xhash' })),
}))
vi.mock('@/features/migration/service/ensureOwnedPermRes', () => ({
  buildDeployOwnedPermResCall: vi.fn(() => DEPLOY_CALL),
  findExistingPermRes: vi.fn(),
  simulateOwnedPermResAddress: vi.fn(async () => RESOLVER),
}))
vi.mock('@/features/migration/service/migrationInvariants', () => ({
  checkMigrationResolverReadiness: vi.fn(async () => ({
    status: 'verified',
    walletHasWildcardRoles: true,
  })),
}))
vi.mock('./changeResolver', () => ({
  buildSetResolverCall: vi.fn(() => SET_RESOLVER_CALL),
}))
vi.mock('./profileRecordTransactions', () => ({
  saveRecords: vi.fn(async () => ({ hash: '0xrecords' })),
}))
vi.mock('./setResolverAccess', () => ({
  canSetNameResolver: vi.fn(async () => true),
}))

import {
  type EOASigner,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  buildDeployOwnedPermResCall,
  findExistingPermRes,
} from '@/features/migration/service/ensureOwnedPermRes'
import { checkMigrationResolverReadiness } from '@/features/migration/service/migrationInvariants'
import { saveRecords } from './profileRecordTransactions'
import { canSetNameResolver } from './setResolverAccess'
import {
  OwnedResolverNotReadyError,
  ResolverChangeNotAuthorizedError,
  setupControlledResolver,
} from './setupControlledResolver'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const DEPLOY_CALL = {
  to: '0x00000000000000000000000000000000000000a1' as Address,
  data: '0xdeploy' as const,
  value: 0n,
}
const SET_RESOLVER_CALL = {
  to: '0x00000000000000000000000000000000000000a2' as Address,
  data: '0xsetresolver' as const,
  value: 0n,
}
const CHAIN_ID = 11155111
const publicClient = {} as PublicClient

const signer: EOASigner = {
  type: 'eoa',
  walletClient: { account: { address: OWNER } } as WalletClient,
}

const snapshots = {
  before: { texts: [], coins: [] },
  after: { texts: [], coins: [{ coinType: 60, value: OWNER }] },
}

const startTransaction = vi.mocked(transactionManager.startTransaction)
const findExisting = vi.mocked(findExistingPermRes)
const deployOwnedResolver = vi.mocked(buildDeployOwnedPermResCall)
const writeRecords = vi.mocked(saveRecords)
const checkSetResolverAccess = vi.mocked(canSetNameResolver)
const checkResolverReadiness = vi.mocked(checkMigrationResolverReadiness)

const submittedRequests = () =>
  startTransaction.mock.calls.map(([intent]) =>
    'request' in intent ? intent.request : intent,
  )

beforeEach(() => {
  vi.clearAllMocks()
  findExisting.mockResolvedValue(null)
  checkSetResolverAccess.mockResolvedValue(true)
})

describe('setupControlledResolver', () => {
  it('deploys, writes records, then sets the resolver from the owner EOA', async () => {
    await expect(
      setupControlledResolver({
        name: 'leon.eth',
        signer,
        ownerAddress: OWNER,
        publicClient,
        chainId: CHAIN_ID,
        ...snapshots,
      }),
    ).resolves.toBe(RESOLVER)

    expect(findExisting).toHaveBeenCalledWith({
      eoa: OWNER,
      publicClient,
    })
    expect(deployOwnedResolver).toHaveBeenCalledWith(OWNER)
    expect(checkResolverReadiness).toHaveBeenCalledWith({
      resolver: RESOLVER,
      hca: OWNER,
      wallet: OWNER,
      publicClient,
    })
    expect(checkSetResolverAccess).toHaveBeenCalledTimes(2)
    expect(submittedRequests()).toEqual([
      { type: 'eoa', from: OWNER, chainId: CHAIN_ID, ...DEPLOY_CALL },
      { type: 'eoa', from: OWNER, chainId: CHAIN_ID, ...SET_RESOLVER_CALL },
    ])
    expect(writeRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'leon.eth',
        signer,
        accountAddress: OWNER,
        resolverAddress: RESOLVER,
        shouldClearRecords: true,
        ...snapshots,
      }),
    )
    expect(startTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      writeRecords.mock.invocationCallOrder[0] ?? 0,
    )
    expect(writeRecords.mock.invocationCallOrder[0]).toBeLessThan(
      startTransaction.mock.invocationCallOrder[1] ?? 0,
    )
  })

  it('skips deployment when an owner-controlled resolver already exists', async () => {
    findExisting.mockResolvedValue(RESOLVER)

    await setupControlledResolver({
      name: 'leon.eth',
      signer,
      ownerAddress: OWNER,
      publicClient,
      chainId: CHAIN_ID,
      ...snapshots,
    })

    expect(deployOwnedResolver).not.toHaveBeenCalled()
    expect(submittedRequests()).toEqual([
      { type: 'eoa', from: OWNER, chainId: CHAIN_ID, ...SET_RESOLVER_CALL },
    ])
  })

  it('does not repoint the name when writing records fails', async () => {
    findExisting.mockResolvedValue(RESOLVER)
    writeRecords.mockRejectedValueOnce(new Error('user rejected'))

    await expect(
      setupControlledResolver({
        name: 'leon.eth',
        signer,
        ownerAddress: OWNER,
        publicClient,
        chainId: CHAIN_ID,
        ...snapshots,
      }),
    ).rejects.toThrow('user rejected')

    expect(submittedRequests()).toEqual([])
  })

  it('omits the record write when both snapshots are empty', async () => {
    await setupControlledResolver({
      name: 'leon.eth',
      signer,
      ownerAddress: OWNER,
      publicClient,
      chainId: CHAIN_ID,
      before: { texts: [], coins: [] },
      after: { texts: [], coins: [] },
    })

    expect(writeRecords).not.toHaveBeenCalled()
    expect(submittedRequests()).toEqual([
      { type: 'eoa', from: OWNER, chainId: CHAIN_ID, ...DEPLOY_CALL },
      { type: 'eoa', from: OWNER, chainId: CHAIN_ID, ...SET_RESOLVER_CALL },
    ])
  })

  it('clears an existing resolver node even when both snapshots are empty', async () => {
    findExisting.mockResolvedValue(RESOLVER)
    const emptySnapshots = {
      before: { texts: [], coins: [] },
      after: { texts: [], coins: [] },
    }

    await setupControlledResolver({
      name: 'leon.eth',
      signer,
      ownerAddress: OWNER,
      publicClient,
      chainId: CHAIN_ID,
      ...emptySnapshots,
    })

    expect(writeRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        ...emptySnapshots,
        shouldClearRecords: true,
        resolverAddress: RESOLVER,
      }),
    )
  })

  it('stops before the first transaction when the owner cannot set the resolver', async () => {
    checkSetResolverAccess.mockResolvedValue(false)

    await expect(
      setupControlledResolver({
        name: 'leon.eth',
        signer,
        ownerAddress: OWNER,
        publicClient,
        chainId: CHAIN_ID,
        ...snapshots,
      }),
    ).rejects.toBeInstanceOf(ResolverChangeNotAuthorizedError)

    expect(startTransaction).not.toHaveBeenCalled()
    expect(writeRecords).not.toHaveBeenCalled()
  })

  it('does not use an existing resolver that fails readiness checks', async () => {
    findExisting.mockResolvedValue(RESOLVER)
    checkResolverReadiness.mockResolvedValueOnce({
      status: 'deployment-required',
      resolver: RESOLVER,
    })

    await expect(
      setupControlledResolver({
        name: 'leon.eth',
        signer,
        ownerAddress: OWNER,
        publicClient,
        chainId: CHAIN_ID,
        ...snapshots,
      }),
    ).rejects.toBeInstanceOf(OwnedResolverNotReadyError)

    expect(startTransaction).not.toHaveBeenCalled()
    expect(writeRecords).not.toHaveBeenCalled()
  })

  it('rechecks resolver authority before the final transaction', async () => {
    findExisting.mockResolvedValue(RESOLVER)
    checkSetResolverAccess
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await expect(
      setupControlledResolver({
        name: 'leon.eth',
        signer,
        ownerAddress: OWNER,
        publicClient,
        chainId: CHAIN_ID,
        ...snapshots,
      }),
    ).rejects.toBeInstanceOf(ResolverChangeNotAuthorizedError)

    expect(writeRecords).toHaveBeenCalledOnce()
    expect(startTransaction).not.toHaveBeenCalled()
  })

  it('stops before the first transaction when the access preflight is unavailable', async () => {
    findExisting.mockResolvedValue(RESOLVER)
    checkSetResolverAccess.mockRejectedValue(new Error('rpc unavailable'))

    await expect(
      setupControlledResolver({
        name: 'leon.eth',
        signer,
        ownerAddress: OWNER,
        publicClient,
        chainId: CHAIN_ID,
        ...snapshots,
      }),
    ).rejects.toThrow('rpc unavailable')

    expect(startTransaction).not.toHaveBeenCalled()
    expect(writeRecords).not.toHaveBeenCalled()
  })

  it('surfaces a resolver transaction failure', async () => {
    findExisting.mockResolvedValue(RESOLVER)
    vi.mocked(waitForTransaction).mockRejectedValueOnce(
      new Error('execution reverted: Unauthorized'),
    )

    await expect(
      setupControlledResolver({
        name: 'leon.eth',
        signer,
        ownerAddress: OWNER,
        publicClient,
        chainId: CHAIN_ID,
        ...snapshots,
      }),
    ).rejects.toThrow('execution reverted: Unauthorized')
  })

  it('rejects subnames before doing any on-chain work', async () => {
    await expect(
      setupControlledResolver({
        name: 'sub.leon.eth',
        signer,
        ownerAddress: OWNER,
        publicClient,
        chainId: CHAIN_ID,
        ...snapshots,
      }),
    ).rejects.toThrow(/subname/i)

    expect(startTransaction).not.toHaveBeenCalled()
    expect(findExisting).not.toHaveBeenCalled()
  })
})
