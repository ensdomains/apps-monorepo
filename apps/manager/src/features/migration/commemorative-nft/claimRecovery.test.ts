import { getPublicClient } from '@wagmi/core'
import { Storage } from 'happy-dom'
import type { Address, Hex } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSafeExecutionPublicClient,
  SAFE_WALLET_CONNECTOR,
} from '@/test-utils/safeWallet.fixture'
import {
  reconcilePendingNftClaim,
  submitPendingNftClaim,
} from './claimRecovery'
import { getCommemorativeNftContractAddress } from './config'
import {
  claimCommemorativeNft,
  readCommemorativeNftClaimed,
  waitForCommemorativeNftClaimReceipt,
} from './contract'
import { createCommemorativeNftPreviewEligibility } from './eligibility.fixture'
import { readPendingNftClaim } from './pendingClaim'

vi.mock('@/config', () => ({ envConfig: { network: 'sepolia' } }))
vi.mock('@wagmi/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wagmi/core')>()),
  getPublicClient: vi.fn(),
}))

vi.mock('./contract', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./contract')>()),
  claimCommemorativeNft: vi.fn(),
  readCommemorativeNftClaimed: vi.fn(),
  waitForCommemorativeNftClaimReceipt: vi.fn(),
}))
const ownerAddress: Address = '0x1111111111111111111111111111111111111111'
const contractAddress = getCommemorativeNftContractAddress()
if (!contractAddress) throw new Error('Missing test contract')
const hash: Hex = `0x${'a'.repeat(64)}`
const params: Parameters<typeof submitPendingNftClaim>[0] = {
  wagmiConfig: {} as Parameters<typeof submitPendingNftClaim>[0]['wagmiConfig'],
  chainId: 11155111,
  ownerAddress,
  walletAddress: ownerAddress,
  contractAddress,
  eligibility: {
    ...createCommemorativeNftPreviewEligibility({ ownerAddress }),
    source: 'static',
    proof: [`0x${'b'.repeat(64)}`],
  },
  isCurrent: () => true,
  recheckMigration: async () => true,
}
const deferred = <T>() => {
  let resolve: ((value: T) => void) | undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  if (!resolve) throw new Error('Deferred resolver was not initialized')
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('localStorage', new Storage())
  const held = new Set<string>()
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        name: string,
        _options: LockOptions,
        callback: LockGrantedCallback<unknown>,
      ) => {
        if (held.has(name)) return callback(null)
        held.add(name)
        try {
          return await callback({ name, mode: 'exclusive' })
        } finally {
          held.delete(name)
        }
      },
    },
  })
  vi.mocked(readCommemorativeNftClaimed).mockResolvedValue(false)
  vi.mocked(claimCommemorativeNft).mockResolvedValue(hash)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('commemorative NFT claim submission coordination', () => {
  it('allows only one tab to hold preflight and wallet submission until its hash is saved', async () => {
    const wallet = deferred<Hex>()
    vi.mocked(claimCommemorativeNft).mockReturnValueOnce(wallet.promise)
    const first = submitPendingNftClaim(params)
    await expect(submitPendingNftClaim(params)).rejects.toMatchObject({
      reason: 'claim-in-progress',
    })
    await vi.waitFor(() =>
      expect(claimCommemorativeNft).toHaveBeenCalledTimes(1),
    )
    wallet.resolve(hash)
    const saved = await first
    expect(readPendingNftClaim(saved).claim?.hash).toBe(hash)
    await expect(submitPendingNftClaim(params)).rejects.toMatchObject({
      reason: 'storage-unavailable',
    })
    expect(claimCommemorativeNft).toHaveBeenCalledTimes(1)
  })
  it.each([undefined, {}, { locks: {} }])(
    'fails closed if cross-tab coordination is unavailable: %j',
    async (browserNavigator) => {
      vi.stubGlobal('navigator', browserNavigator)
      await expect(submitPendingNftClaim(params)).rejects.toMatchObject({
        reason: 'browser-unsupported',
      })
      expect(claimCommemorativeNft).not.toHaveBeenCalled()
    },
  )
  it('rechecks current migration scope after the final claimed read', async () => {
    const read = deferred<boolean>()
    vi.mocked(readCommemorativeNftClaimed).mockReturnValueOnce(read.promise)
    const isCurrent = vi.fn(() => true)
    const submission = submitPendingNftClaim({ ...params, isCurrent })
    const rejection = expect(submission).rejects.toMatchObject({
      reason: 'feature-disabled',
    })
    await vi.waitFor(() =>
      expect(readCommemorativeNftClaimed).toHaveBeenCalledTimes(1),
    )
    isCurrent.mockReturnValue(false)
    read.resolve(false)
    await rejection
    expect(claimCommemorativeNft).not.toHaveBeenCalled()
  })
  it('releases the lock after wallet rejection so a later explicit attempt can succeed', async () => {
    vi.mocked(claimCommemorativeNft).mockRejectedValueOnce(
      new Error('UserRejectedRequestError'),
    )
    await expect(submitPendingNftClaim(params)).rejects.toThrow(
      'UserRejectedRequestError',
    )
    await expect(submitPendingNftClaim(params)).resolves.toMatchObject({ hash })
    expect(claimCommemorativeNft).toHaveBeenCalledTimes(2)
  })

  it('retains an uncertain submitted claim and blocks another wallet submission', async () => {
    const claim = await submitPendingNftClaim(params)
    vi.mocked(waitForCommemorativeNftClaimReceipt).mockResolvedValue({
      status: 'pending',
      hash,
    })
    const reconciled = await reconcilePendingNftClaim({
      wagmiConfig: params.wagmiConfig,
      claim,
      onHash: vi.fn(),
    })
    expect(reconciled.outcome).toEqual({ status: 'pending', hash })
    expect(readPendingNftClaim(claim).claim?.hash).toBe(hash)
    await expect(submitPendingNftClaim(params)).rejects.toMatchObject({
      reason: 'storage-unavailable',
    })
    expect(claimCommemorativeNft).toHaveBeenCalledTimes(1)
  })

  it('captures an onchain history bound before requesting a Safe claim', async () => {
    const publicClient = createSafeExecutionPublicClient({
      ownerAddress,
      safeTxHash: hash,
      executionHash: hash,
      event: 'ExecutionSuccess',
      latestBlockNumber: 123n,
    })
    vi.mocked(getPublicClient).mockReturnValue(publicClient)
    const getBlockNumber = vi.spyOn(publicClient, 'getBlockNumber')
    const claim = await submitPendingNftClaim({
      ...params,
      connector: SAFE_WALLET_CONNECTOR,
    })
    expect(getBlockNumber).toHaveBeenCalledBefore(
      vi.mocked(claimCommemorativeNft),
    )
    expect(claim.safeExecutionSearchFromBlock).toBe(123n)
    expect(readPendingNftClaim(claim).claim?.safeExecutionSearchFromBlock).toBe(
      123n,
    )
  })

  it('rechecks the current owner and chain after reading the Safe submission block', async () => {
    const publicClient = createSafeExecutionPublicClient({
      ownerAddress,
      safeTxHash: hash,
      executionHash: hash,
      event: 'ExecutionSuccess',
    })
    const block = deferred<bigint>()
    const getBlockNumber = vi
      .spyOn(publicClient, 'getBlockNumber')
      .mockReturnValueOnce(block.promise)
    vi.mocked(getPublicClient).mockReturnValue(publicClient)
    const isCurrent = vi.fn(() => true)
    const submission = submitPendingNftClaim({
      ...params,
      connector: SAFE_WALLET_CONNECTOR,
      isCurrent,
    })
    const rejection = expect(submission).rejects.toMatchObject({
      reason: 'feature-disabled',
    })
    await vi.waitFor(() => expect(getBlockNumber).toHaveBeenCalledTimes(1))
    isCurrent.mockReturnValue(false)
    block.resolve(123n)
    await rejection
    expect(claimCommemorativeNft).not.toHaveBeenCalled()
    expect(
      readPendingNftClaim({
        ownerAddress,
        chainId: params.chainId,
        contractAddress,
      }).status,
    ).toBe('empty')
  })

  it('persists only explicitly reported Safe history progress without changing the hash', async () => {
    const claim = await submitPendingNftClaim(params)
    vi.mocked(waitForCommemorativeNftClaimReceipt).mockImplementation(
      async ({ onHistoryProgress }) => {
        onHistoryProgress?.(9_900n)
        return { status: 'pending', hash }
      },
    )
    await reconcilePendingNftClaim({
      wagmiConfig: params.wagmiConfig,
      claim,
      onHash: vi.fn(),
    })
    expect(readPendingNftClaim(claim).claim).toEqual({
      ...claim,
      safeExecutionSearchFromBlock: 9_900n,
    })
  })
})
