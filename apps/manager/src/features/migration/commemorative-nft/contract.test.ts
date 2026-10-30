import {
  getPublicClient,
  getTransaction,
  readContract,
  writeContract,
} from '@wagmi/core'
import {
  type Address,
  type Hex,
  toEventSelector,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
  zeroHash,
} from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'
import { SAFE_WALLET_CONNECTOR } from '@/test-utils/safeWallet.fixture'
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

const { config } = vi.hoisted(() => ({
  config: { network: 'sepolia' as EnsNetwork },
}))

vi.mock('@/config', () => ({ envConfig: config }))

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
vi.mock('@/lib/wallet/ensureWalletChain', () => ({
  ensureWalletChain: vi.fn(),
}))
const publicClient = {} as NonNullable<ReturnType<typeof getPublicClient>>
const ensureWalletChainMock = vi.mocked(ensureWalletChain)
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
const contractAddress: Address = '0xa55605c6242CbFc27117b63466B423fbc092a2A9'
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
  config.network = 'sepolia'
  vi.resetAllMocks()
  vi.mocked(getPublicClient).mockReturnValue(publicClient)
  waitForTransactionReceiptMock.mockResolvedValue(receipt())
  getTransactionMock.mockResolvedValue(transaction())
  readContractMock.mockResolvedValue(true)
})

describe('commemorative NFT contract', () => {
  it('uses the deployed mainnet contract for reads and claims', async () => {
    config.network = 'mainnet'
    writeContractMock.mockResolvedValue(hash)
    await expect(
      readCommemorativeNftClaimed({
        wagmiConfig,
        chainId: 1,
        ownerAddress,
      }),
    ).resolves.toBe(true)
    await expect(
      claimCommemorativeNft({
        wagmiConfig,
        chainId: 1,
        ownerAddress,
        walletAddress: ownerAddress,
        proof,
      }),
    ).resolves.toBe(hash)
    expect(readContractMock).toHaveBeenCalledWith(
      wagmiConfig,
      expect.objectContaining({
        address: '0x20262e3433306a4FF250a64d20a8E0F09B2C7F68',
        chainId: 1,
        functionName: 'hasClaimed',
        args: [ownerAddress],
      }),
    )
    expect(ensureWalletChainMock).toHaveBeenCalledWith(wagmiConfig, 1)
    expect(writeContractMock).toHaveBeenCalledWith(
      wagmiConfig,
      expect.objectContaining({
        address: '0x20262e3433306a4FF250a64d20a8E0F09B2C7F68',
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
    expect(ensureWalletChainMock).toHaveBeenCalledWith(wagmiConfig, 11155111)
    expect(ensureWalletChainMock).toHaveBeenCalledBefore(writeContractMock)
    expect(writeContractMock).toHaveBeenCalledWith(
      wagmiConfig,
      expect.objectContaining({
        address: contractAddress,
        chainId: 11155111,
        account: ownerAddress,
        functionName: 'claim',
        args: [proof],
      }),
    )
  })
  it('treats a declined chain switch as a cancelled mint', async () => {
    ensureWalletChainMock.mockRejectedValueOnce(
      new UserRejectedRequestError(new Error('User rejected the request.')),
    )
    await expect(
      claimCommemorativeNft({
        wagmiConfig,
        chainId: 11155111,
        ownerAddress,
        walletAddress: ownerAddress,
        proof,
      }),
    ).rejects.toMatchObject({ reason: 'user-rejected' })
    expect(writeContractMock).not.toHaveBeenCalled()
  })
  it('refuses a different wallet', async () => {
    await expect(
      claimCommemorativeNft({
        wagmiConfig,
        chainId: 11155111,
        ownerAddress,
        walletAddress: '0x538cDec1cb3e7A874D473E36558F535Ba2343B83',
        proof,
      }),
    ).rejects.toMatchObject({ reason: 'wallet-mismatch' })
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
    expect(readContractMock).toHaveBeenCalledWith(
      wagmiConfig,
      expect.objectContaining({
        address: contractAddress,
        chainId: 11155111,
        functionName: 'hasClaimed',
        args: [ownerAddress],
      }),
    )
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
  it.each(['cancelled', 'replaced', 'repriced'] as const)(
    'handles a %s same-nonce transaction',
    async (reason) => {
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
    },
  )
  it.each([
    { from: '0x1111111111111111111111111111111111111111' as const },
    { to: ownerAddress },
    { value: 1n },
    { input: '0x' as const },
  ])(
    'rejects unrelated restored transaction identity %s',
    async (overrides) => {
      getTransactionMock.mockResolvedValue(transaction(overrides))
      await expect(
        waitForCommemorativeNftClaimReceipt({ wagmiConfig, pendingClaim }),
      ).resolves.toEqual({ status: 'replaced', hash })
      expect(readContractMock).not.toHaveBeenCalled()
    },
  )
  it.each(['receipt', 'transaction', 'claimed'] as const)(
    'keeps the hash on an unavailable %s read',
    async (stage) => {
      if (stage === 'receipt')
        waitForTransactionReceiptMock.mockRejectedValue(new Error('Timed out'))
      if (stage === 'transaction')
        getTransactionMock.mockRejectedValue(new Error('RPC unavailable'))
      if (stage === 'claimed')
        readContractMock.mockRejectedValue(new Error('RPC unavailable'))
      await expect(
        waitForCommemorativeNftClaimReceipt({ wagmiConfig, pendingClaim }),
      ).resolves.toEqual({ status: 'pending', hash })
    },
  )
  describe('with a Safe{Wallet}', () => {
    const executionHash: Hex = `0x${'c'.repeat(64)}`
    // The wallet returned the safeTxHash; a signer's execTransaction carried it.
    const waitForSafeClaim = (
      event: 'ExecutionSuccess' | 'ExecutionFailure',
    ) => {
      vi.mocked(getPublicClient).mockReturnValue({
        pollingInterval: 1,
        getBlockNumber: async () => 100n,
        getLogs: async () => [
          {
            topics: [toEventSelector(`${event}(bytes32,uint256)`), hash],
            data: zeroHash,
            transactionHash: executionHash,
          },
        ],
      } as unknown as NonNullable<ReturnType<typeof getPublicClient>>)
      waitForTransactionReceiptMock.mockImplementation(
        async (_client, { hash: waited }) => {
          if (waited !== executionHash)
            throw new WaitForTransactionReceiptTimeoutError({ hash: waited })
          return receipt(executionHash)
        },
      )
      getTransactionMock.mockResolvedValue(
        transaction({
          hash: executionHash,
          from: '0x1111111111111111111111111111111111111111',
          to: ownerAddress,
          input: '0x6a761202',
        }),
      )
      return waitForCommemorativeNftClaimReceipt({
        wagmiConfig,
        pendingClaim,
        connector: SAFE_WALLET_CONNECTOR,
      })
    }

    it('confirms a claim the Safe executed, at the executing block', async () => {
      await expect(waitForSafeClaim('ExecutionSuccess')).resolves.toEqual({
        status: 'confirmed',
        hash: executionHash,
      })
      expect(readContractMock).toHaveBeenCalledWith(
        wagmiConfig,
        expect.objectContaining({
          functionName: 'hasClaimed',
          args: [ownerAddress],
          blockNumber: 42n,
        }),
      )
    })

    it('reports a failed Safe execution as reverted without reading the claim', async () => {
      await expect(waitForSafeClaim('ExecutionFailure')).resolves.toEqual({
        status: 'reverted',
        hash,
      })
      expect(readContractMock).not.toHaveBeenCalled()
    })
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

import type { EnsNetwork } from '@ens-apps/config'
