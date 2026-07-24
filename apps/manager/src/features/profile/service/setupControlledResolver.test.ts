import type { Address, PublicClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/transaction-manager', () => ({
  getSmartAccountAddress: (signer: { config: { accountAddress: Address } }) =>
    signer.config.accountAddress,
  transactionManager: { startTransaction: vi.fn(() => 'tx-bundle') },
  waitForTransaction: vi.fn(async () => ({ hash: '0xhash' })),
}))
vi.mock('@/features/migration/service/ensureOwnedPermRes', () => ({
  buildDeployOwnedPermResCall: vi.fn(() => DEPLOY_CALL),
  ensureOwnedPermResViaSigner: vi.fn(async () => RESOLVER),
  findExistingPermRes: vi.fn(),
  simulateOwnedPermResAddress: vi.fn(async () => RESOLVER),
}))
vi.mock('./changeResolver', () => ({
  buildSetResolverCall: vi.fn(() => SET_RESOLVER_CALL),
  changeResolver: vi.fn(() => 'tx-set-resolver'),
}))
vi.mock('./profileRecordTransactions', () => ({
  buildRecordsUpdateCalls: vi.fn(async () => ({
    calls: RECORD_CALLS,
    description: 'records',
  })),
  saveRecords: vi.fn(async () => ({ hash: '0xhash', txId: 'tx-records' })),
}))

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  buildDeployOwnedPermResCall,
  ensureOwnedPermResViaSigner,
  findExistingPermRes,
} from '@/features/migration/service/ensureOwnedPermRes'
import { changeResolver } from './changeResolver'
import { saveRecords } from './profileRecordTransactions'
import { setupControlledResolver } from './setupControlledResolver'

const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address
const SMART_ACCOUNT = '0x2222222222222222222222222222222222222222' as Address
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
const RECORD_CALLS = [{ to: RESOLVER, data: '0xrecord' as const, value: 0n }]
const CHAIN_ID = 11155111
const publicClient = {} as PublicClient

const eoaSigner: Signer = { type: 'eoa', walletClient: {} as never }
const smartSigner: Signer = {
  type: 'rhinestone',
  account: {} as never,
  config: { accountAddress: SMART_ACCOUNT, rhinestoneApiKey: 'k' },
}

const snapshots = {
  before: { texts: [], coins: [] },
  after: { texts: [], coins: [{ coinType: 60, value: ACCOUNT }] },
}

const start = vi.mocked(transactionManager.startTransaction)
const mockedFindExisting = vi.mocked(findExistingPermRes)
const mockedDeployCall = vi.mocked(buildDeployOwnedPermResCall)
const mockedEnsureOwned = vi.mocked(ensureOwnedPermResViaSigner)
const mockedChangeResolver = vi.mocked(changeResolver)
const mockedWait = vi.mocked(waitForTransaction)
const mockedSaveRecords = vi.mocked(saveRecords)

afterEach(() => {
  vi.clearAllMocks()
})

describe('setupControlledResolver', () => {
  it('bundles deploy + setResolver + records into one sponsored intent for smart accounts', async () => {
    mockedFindExisting.mockResolvedValue(null)

    const resolver = await setupControlledResolver({
      name: 'leon.eth',
      signer: smartSigner,
      accountAddress: SMART_ACCOUNT,
      publicClient,
      chainId: CHAIN_ID,
      ...snapshots,
    })

    expect(resolver).toBe(RESOLVER)
    expect(start).toHaveBeenCalledTimes(1)
    const [intent] = start.mock.calls[0] ?? []
    expect(intent).toEqual({
      type: 'custom',
      request: {
        type: 'rhinestone-intent',
        from: SMART_ACCOUNT,
        chainId: CHAIN_ID,
        rhinestoneParams: {
          calls: [DEPLOY_CALL, SET_RESOLVER_CALL, ...RECORD_CALLS],
          sponsored: true,
        },
      },
    })
    // The bundle replaces the sequential path entirely.
    expect(mockedEnsureOwned).not.toHaveBeenCalled()
    expect(mockedSaveRecords).not.toHaveBeenCalled()
  })

  it('omits the deploy call when the owned resolver already exists', async () => {
    mockedFindExisting.mockResolvedValue(RESOLVER)

    await setupControlledResolver({
      name: 'leon.eth',
      signer: smartSigner,
      accountAddress: SMART_ACCOUNT,
      publicClient,
      chainId: CHAIN_ID,
      ...snapshots,
    })

    expect(mockedDeployCall).not.toHaveBeenCalled()
    const [intent] = start.mock.calls[0] ?? []
    const calls = (
      intent as unknown as {
        request: { rhinestoneParams: { calls: unknown[] } }
      }
    ).request.rhinestoneParams.calls
    expect(calls).toEqual([SET_RESOLVER_CALL, ...RECORD_CALLS])
  })

  it('runs deploy + setResolver + records sequentially for EOAs', async () => {
    const resolver = await setupControlledResolver({
      name: 'leon.eth',
      signer: eoaSigner,
      accountAddress: ACCOUNT,
      publicClient,
      chainId: CHAIN_ID,
      ...snapshots,
    })

    expect(resolver).toBe(RESOLVER)
    expect(mockedEnsureOwned).toHaveBeenCalledWith({
      account: ACCOUNT,
      signer: eoaSigner,
      chainId: CHAIN_ID,
      publicClient,
    })
    expect(mockedChangeResolver).toHaveBeenCalledWith({
      name: 'leon.eth',
      newResolver: RESOLVER,
      signer: eoaSigner,
      accountAddress: ACCOUNT,
      publicClient,
      chainId: CHAIN_ID,
    })
    expect(mockedWait).toHaveBeenCalledWith('tx-set-resolver')
    expect(mockedSaveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'leon.eth',
        resolverAddress: RESOLVER,
        accountAddress: ACCOUNT,
      }),
    )
    // No bundled intent on the EOA path.
    expect(start).not.toHaveBeenCalled()
  })

  it('orders the EOA steps: deploy, setResolver, confirmation, records', async () => {
    const order: string[] = []
    mockedEnsureOwned.mockImplementationOnce(async () => {
      order.push('deploy')
      return RESOLVER
    })
    mockedChangeResolver.mockImplementationOnce(() => {
      order.push('setResolver')
      return 'tx-set-resolver'
    })
    mockedWait.mockImplementationOnce(async () => {
      order.push('wait')
      return { hash: '0xhash' } as never
    })
    mockedSaveRecords.mockImplementationOnce(async () => {
      order.push('records')
      return { hash: '0xhash', txId: 'tx-records' } as never
    })

    await setupControlledResolver({
      name: 'leon.eth',
      signer: eoaSigner,
      accountAddress: ACCOUNT,
      publicClient,
      chainId: CHAIN_ID,
      ...snapshots,
    })

    expect(order).toEqual(['deploy', 'setResolver', 'wait', 'records'])
  })

  it('propagates an EOA deploy failure without assigning a resolver or writing records', async () => {
    mockedEnsureOwned.mockRejectedValueOnce(new Error('deploy reverted'))

    await expect(
      setupControlledResolver({
        name: 'leon.eth',
        signer: eoaSigner,
        accountAddress: ACCOUNT,
        publicClient,
        chainId: CHAIN_ID,
        ...snapshots,
      }),
    ).rejects.toThrow('deploy reverted')

    expect(mockedChangeResolver).not.toHaveBeenCalled()
    expect(mockedSaveRecords).not.toHaveBeenCalled()
  })

  it.each([
    ['smart account', smartSigner],
    ['EOA', eoaSigner],
  ] as const)('rejects subnames before doing any on-chain work (%s)', async (_label, signer) => {
    await expect(
      setupControlledResolver({
        name: 'sub.leon.eth',
        signer,
        accountAddress: ACCOUNT,
        publicClient,
        chainId: CHAIN_ID,
        ...snapshots,
      }),
    ).rejects.toThrow(/subname/i)

    expect(start).not.toHaveBeenCalled()
    expect(mockedEnsureOwned).not.toHaveBeenCalled()
    expect(mockedFindExisting).not.toHaveBeenCalled()
  })
})
