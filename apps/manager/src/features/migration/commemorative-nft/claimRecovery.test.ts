import { Storage } from 'happy-dom'
import type { Address, Hex } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { submitPendingNftClaim } from './claimRecovery'
import { getCommemorativeNftContractAddress } from './config'
import { claimCommemorativeNft, readCommemorativeNftClaimed } from './contract'
import { createCommemorativeNftPreviewEligibility } from './eligibility.fixture'
import { readPendingNftClaim } from './pendingClaim'

vi.mock('@/config', () => ({ envConfig: { network: 'sepolia' } }))

vi.mock('./contract', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./contract')>()),
  claimCommemorativeNft: vi.fn(),
  readCommemorativeNftClaimed: vi.fn(),
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
  it.each([
    undefined,
    {},
    { locks: {} },
  ])('fails closed if cross-tab coordination is unavailable: %j', async (browserNavigator) => {
    vi.stubGlobal('navigator', browserNavigator)
    await expect(submitPendingNftClaim(params)).rejects.toMatchObject({
      reason: 'browser-unsupported',
    })
    expect(claimCommemorativeNft).not.toHaveBeenCalled()
  })
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
})
