import {
  getPublicClient,
  getTransaction,
  readContract,
  writeContract,
} from '@wagmi/core'
import type { Address, Hex } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCommemorativeNftContractAddress } from './config'
import { MAINNET_NFT_TEST_ADDRESS } from './config.fixture'
import {
  CommemorativeNftClaimError,
  claimCommemorativeNft,
  decodeCommemorativeNftClaimError,
  encodeCommemorativeNftClaim,
  readCommemorativeNftClaimed,
  waitForCommemorativeNftClaimReceipt,
} from './contract'
import type { PendingNftClaim } from './pendingClaim'
import { getCommemorativeNftClaimedRefetchInterval } from './queries'

vi.mock('@wagmi/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wagmi/core')>()),
  getPublicClient: vi.fn(),
  getTransaction: vi.fn(),
  readContract: vi.fn(),
  writeContract: vi.fn(),
}))
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  waitForTransactionReceipt: vi.fn(),
}))
const publicClient = {} as NonNullable<ReturnType<typeof getPublicClient>>
const writeContractMock = vi.mocked(writeContract)
const readContractMock = vi.mocked(readContract)
const waitForTransactionReceiptMock = vi.mocked(waitForTransactionReceipt)
const getTransactionMock = vi.mocked(getTransaction)
const ownerAddress: Address = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'
const proof = [
  '0x017995f95e79303c1853e326b15e6dcc16e6aa20f07372e4f0ab63c0b84f2631',
] as const
const hash: Hex = `0x${'a'.repeat(64)}`
const replacementHash: Hex = `0x${'b'.repeat(64)}`
const wagmiConfig = {} as Parameters<
  typeof claimCommemorativeNft
>[0]['wagmiConfig']
const contractAddress = getCommemorativeNftContractAddress(11155111)
if (!contractAddress) throw new Error('Missing test NFT contract')
const pendingClaim: PendingNftClaim = {
  version: 1,
  ownerAddress,
  contractAddress,
  chainId: 11155111,
  hash,
  expectedClaimData: encodeCommemorativeNftClaim(proof),
  submittedAt: 1,
}
const receipt = (transactionHash = hash) =>
  ({ status: 'success', transactionHash, blockNumber: 42n }) as Awaited<
    ReturnType<typeof waitForTransactionReceipt>
  >
const transaction = (
  overrides: Partial<Awaited<ReturnType<typeof getTransaction>>> = {},
) =>
  ({
    hash,
    from: ownerAddress,
    to: contractAddress,
    value: 0n,
    input: pendingClaim.expectedClaimData,
    ...overrides,
  }) as Awaited<ReturnType<typeof getTransaction>>

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getPublicClient).mockReturnValue(publicClient)
  waitForTransactionReceiptMock.mockResolvedValue(receipt())
  getTransactionMock.mockResolvedValue(transaction())
  readContractMock.mockResolvedValue(true)
})

afterEach(() => vi.unstubAllEnvs())

describe('commemorative NFT contract', () => {
  it('reads and submits claims to the configured contract on mainnet', async () => {
    vi.stubEnv(
      'VITE_COMMEMORATIVE_NFT_MAINNET_ADDRESS',
      MAINNET_NFT_TEST_ADDRESS,
    )
    writeContractMock.mockResolvedValue(hash)
    await expect(
      readCommemorativeNftClaimed({ wagmiConfig, chainId: 1, ownerAddress }),
    ).resolves.toBe(true)
    expect(readContractMock).toHaveBeenCalledWith(
      wagmiConfig,
      expect.objectContaining({
        address: MAINNET_NFT_TEST_ADDRESS,
        chainId: 1,
        functionName: 'hasClaimed',
        args: [ownerAddress],
      }),
    )
    await expect(
      claimCommemorativeNft({
        wagmiConfig,
        chainId: 1,
        ownerAddress,
        walletAddress: ownerAddress,
        proof,
      }),
    ).resolves.toBe(hash)
    expect(writeContractMock).toHaveBeenCalledWith(
      wagmiConfig,
      expect.objectContaining({
        address: MAINNET_NFT_TEST_ADDRESS,
        chainId: 1,
        account: ownerAddress,
        functionName: 'claim',
        args: [proof],
      }),
    )
  })
  it('submits a plain EOA claim', async () => {
    writeContractMock.mockResolvedValue(hash)
    await expect(
      claimCommemorativeNft({
        wagmiConfig,
        chainId: 11155111,
        ownerAddress,
        walletAddress: ownerAddress,
        proof,
      }),
    ).resolves.toBe(hash)
    expect(writeContractMock).toHaveBeenCalledWith(
      wagmiConfig,
      expect.objectContaining({
        account: ownerAddress,
        functionName: 'claim',
        args: [proof],
      }),
    )
  })
  it('refuses a different wallet or an unsupported chain', async () => {
    await expect(
      claimCommemorativeNft({
        wagmiConfig,
        chainId: 11155111,
        ownerAddress,
        walletAddress: '0x538cDec1cb3e7A874D473E36558F535Ba2343B83',
        proof,
      }),
    ).rejects.toMatchObject({ reason: 'wallet-mismatch' })
    await expect(
      claimCommemorativeNft({
        wagmiConfig,
        chainId: 10,
        ownerAddress,
        walletAddress: ownerAddress,
        proof,
      }),
    ).rejects.toMatchObject({ reason: 'unsupported-network' })
    expect(writeContractMock).not.toHaveBeenCalled()
  })
  it('reads claimed state directly from the contract', async () => {
    await expect(
      readCommemorativeNftClaimed({
        wagmiConfig,
        chainId: 11155111,
        ownerAddress,
      }),
    ).resolves.toBe(true)
  })
  it('classifies rejection and contract errors', () => {
    expect(
      decodeCommemorativeNftClaimError(
        new Error('UserRejectedRequestError: user rejected request'),
      ).reason,
    ).toBe('user-rejected')
    expect(
      decodeCommemorativeNftClaimError(new Error('InvalidProof()')).reason,
    ).toBe('invalid-proof')
    expect(
      decodeCommemorativeNftClaimError(
        new CommemorativeNftClaimError('already-claimed', 'already'),
      ).reason,
    ).toBe('already-claimed')
  })
  it('confirms only the expected owner claim and receipt-block claimed state', async () => {
    await expect(
      waitForCommemorativeNftClaimReceipt({ wagmiConfig, pendingClaim }),
    ).resolves.toEqual({ status: 'confirmed', hash })
    expect(waitForTransactionReceiptMock).toHaveBeenCalledWith(
      publicClient,
      expect.objectContaining({ pollingInterval: 2_000, timeout: 300_000 }),
    )
    expect(readContractMock).toHaveBeenCalledWith(
      wagmiConfig,
      expect.objectContaining({
        functionName: 'hasClaimed',
        args: [ownerAddress],
        blockNumber: 42n,
      }),
    )
  })
  it('keeps an unverified successful receipt pending', async () => {
    readContractMock.mockResolvedValue(false)
    await expect(
      waitForCommemorativeNftClaimReceipt({ wagmiConfig, pendingClaim }),
    ).resolves.toEqual({ status: 'pending', hash })
  })
  it('returns a reverted outcome without claiming mint success', async () => {
    waitForTransactionReceiptMock.mockResolvedValue({
      ...receipt(),
      status: 'reverted',
    })
    await expect(
      waitForCommemorativeNftClaimReceipt({ wagmiConfig, pendingClaim }),
    ).resolves.toEqual({ status: 'reverted', hash })
    expect(readContractMock).not.toHaveBeenCalled()
  })
  it.each([
    'cancelled',
    'replaced',
    'repriced',
  ] as const)('handles a %s same-nonce transaction', async (reason) => {
    const onReplaced = vi.fn()
    waitForTransactionReceiptMock.mockImplementation(
      async (_config, params) => {
        params.onReplaced?.({
          reason,
          replacedTransaction: transaction(),
          transaction: transaction({ hash: replacementHash }),
          transactionReceipt: receipt(replacementHash),
        })
        return receipt(replacementHash)
      },
    )
    await expect(
      waitForCommemorativeNftClaimReceipt({
        wagmiConfig,
        pendingClaim,
        onReplaced,
      }),
    ).resolves.toEqual({
      status: reason === 'repriced' ? 'confirmed' : reason,
      hash: replacementHash,
    })
    expect(onReplaced).toHaveBeenCalledWith(replacementHash)
    expect(readContractMock).toHaveBeenCalledTimes(
      reason === 'repriced' ? 1 : 0,
    )
  })
  it.each([
    { from: '0x1111111111111111111111111111111111111111' as const },
    { to: ownerAddress },
    { value: 1n },
    { input: '0x' as const },
  ])('rejects unrelated restored transaction identity %s', async (overrides) => {
    getTransactionMock.mockResolvedValue(transaction(overrides))
    await expect(
      waitForCommemorativeNftClaimReceipt({ wagmiConfig, pendingClaim }),
    ).resolves.toEqual({ status: 'replaced', hash })
    expect(readContractMock).not.toHaveBeenCalled()
  })
  it.each([
    'receipt',
    'transaction',
    'claimed',
  ] as const)('keeps the hash on an unavailable %s read', async (stage) => {
    if (stage === 'receipt')
      waitForTransactionReceiptMock.mockRejectedValue(new Error('Timed out'))
    if (stage === 'transaction')
      getTransactionMock.mockRejectedValue(new Error('RPC unavailable'))
    if (stage === 'claimed')
      readContractMock.mockRejectedValue(new Error('RPC unavailable'))
    await expect(
      waitForCommemorativeNftClaimReceipt({ wagmiConfig, pendingClaim }),
    ).resolves.toEqual({ status: 'pending', hash })
  })
  it('rejects persisted scope from another configured contract', async () => {
    await expect(
      waitForCommemorativeNftClaimReceipt({
        wagmiConfig,
        pendingClaim: { ...pendingClaim, contractAddress: ownerAddress },
      }),
    ).rejects.toMatchObject({ reason: 'unsupported-network' })
    expect(waitForTransactionReceiptMock).not.toHaveBeenCalled()
  })
  it('stops a stalled foreground check at five minutes without declaring failure', async () => {
    vi.useFakeTimers()
    try {
      waitForTransactionReceiptMock.mockReturnValue(new Promise(() => {}))
      const result = waitForCommemorativeNftClaimReceipt({
        wagmiConfig,
        pendingClaim,
      })
      await vi.advanceTimersByTimeAsync(300_000)
      await expect(result).resolves.toEqual({ status: 'pending', hash })
    } finally {
      vi.useRealTimers()
    }
  })
  it('polls only during a bounded submitted claim check', () => {
    expect(
      getCommemorativeNftClaimedRefetchInterval({ poll: true, claimed: false }),
    ).toBe(2_000)
    expect(
      getCommemorativeNftClaimedRefetchInterval({ poll: true, claimed: true }),
    ).toBe(false)
    expect(
      getCommemorativeNftClaimedRefetchInterval({
        poll: false,
        claimed: false,
      }),
    ).toBe(false)
  })
})
