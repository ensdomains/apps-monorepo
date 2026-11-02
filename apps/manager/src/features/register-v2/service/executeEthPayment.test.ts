import { getConnectorClient } from '@wagmi/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publicClient } from '@/lib/wagmi'
import { followChain } from '@/lib/wallet/followChain'
import { getEthSwapQuote } from './ethPayment'
import { executeEthPayment, hasPendingEthPayment } from './executeEthPayment'

const mocks = vi.hoisted(() => ({
  sendTransaction: vi.fn(),
}))

vi.mock('@wagmi/core', () => ({ getConnectorClient: vi.fn() }))
vi.mock('@/lib/wagmi', () => ({
  publicClient: {
    getBalance: vi.fn(),
    estimateGas: vi.fn(),
    getGasPrice: vi.fn(),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  },
  wagmiConfig: {},
}))
vi.mock('@/lib/wallet/followChain', () => ({ followChain: vi.fn() }))
vi.mock('@/lib/wallet/ensureWalletChain', () => ({
  ensureWalletChain: vi.fn(),
}))
vi.mock('./ethPayment', () => ({
  getEthSwapQuote: vi.fn(),
  assertFreshEthQuote: vi.fn(),
  buildEthSwapCall: vi.fn(() => ({
    to: '0x2222222222222222222222222222222222222222',
    data: '0x1234',
    value: 1_020n,
  })),
}))

const owner = '0x1111111111111111111111111111111111111111'
const amountOut = 2_000_000n
const hash = `0x${'ab'.repeat(32)}` as const
afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(getConnectorClient).mockResolvedValue({} as never)
  vi.mocked(followChain).mockResolvedValue({
    account: { address: owner },
    sendTransaction: mocks.sendTransaction,
  } as never)
  vi.mocked(getEthSwapQuote).mockResolvedValue({
    amountOut,
    amountIn: 1_000n,
    maximumEth: 1_020n,
    fee: 500,
    quotedAt: Date.now(),
  })
  vi.mocked(publicClient.getBalance).mockResolvedValue(10_000n)
  vi.mocked(publicClient.estimateGas).mockResolvedValue(100n)
  vi.mocked(publicClient.getGasPrice).mockResolvedValue(2n)
  vi.mocked(publicClient.readContract).mockResolvedValue(0n as never)
  mocks.sendTransaction.mockResolvedValue(hash)
  vi.mocked(publicClient.waitForTransactionReceipt).mockResolvedValue({
    status: 'success',
  } as never)
})

describe('ETH payment submission', () => {
  it('switches to the destination chain, submits the capped swap, and waits for success', async () => {
    await executeEthPayment(owner, amountOut, 1_020n)

    expect(getConnectorClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ account: owner, assertChainId: false }),
    )
    expect(getEthSwapQuote).toHaveBeenCalledWith(amountOut)
    expect(mocks.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ value: 1_020n, data: '0x1234' }),
    )
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ hash, onReplaced: expect.any(Function) }),
    )
    expect(hasPendingEthPayment(owner)).toBe(false)
  })

  it('refuses to sign if the connected wallet changed', async () => {
    vi.mocked(followChain).mockResolvedValue({
      account: { address: '0x3333333333333333333333333333333333333333' },
      sendTransaction: mocks.sendTransaction,
    } as never)
    await expect(executeEthPayment(owner, amountOut, 1_020n)).rejects.toThrow(
      'connected wallet changed',
    )
    expect(getEthSwapQuote).not.toHaveBeenCalled()
    expect(mocks.sendTransaction).not.toHaveBeenCalled()
  })

  it('reserves ETH for gas before presenting the transaction', async () => {
    vi.mocked(publicClient.getBalance).mockResolvedValue(1_419n)
    await expect(executeEthPayment(owner, amountOut, 1_020n)).rejects.toThrow(
      'Not enough ETH',
    )
    expect(mocks.sendTransaction).not.toHaveBeenCalled()
  })

  it('does not submit ETH when it cannot save the pending transaction', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('Storage denied')
      }),
    })
    await expect(executeEthPayment(owner, amountOut, 1_020n)).rejects.toThrow(
      'Browser storage is unavailable',
    )
    expect(mocks.sendTransaction).not.toHaveBeenCalled()
  })

  it('does not submit ETH when browser storage cannot be read', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('Storage denied')
      }),
      setItem: vi.fn(),
    })
    expect(hasPendingEthPayment(owner)).toBe(false)
    await expect(executeEthPayment(owner, amountOut, 1_020n)).rejects.toThrow(
      'Browser storage is unavailable',
    )
    expect(mocks.sendTransaction).not.toHaveBeenCalled()
  })

  it('never asks the wallet to spend more ETH than was displayed', async () => {
    vi.mocked(getEthSwapQuote).mockResolvedValue({
      amountOut,
      amountIn: 1_010n,
      maximumEth: 1_030n,
      fee: 500,
      quotedAt: Date.now(),
    })
    await expect(executeEthPayment(owner, amountOut, 1_020n)).rejects.toThrow(
      'ETH price changed',
    )
    expect(mocks.sendTransaction).not.toHaveBeenCalled()
  })

  it('surfaces an on-chain swap revert', async () => {
    vi.mocked(publicClient.waitForTransactionReceipt).mockResolvedValue({
      status: 'reverted',
    } as never)
    await expect(executeEthPayment(owner, amountOut, 1_020n)).rejects.toThrow(
      'failed on-chain',
    )
    expect(hasPendingEthPayment(owner)).toBe(false)
  })

  it('resumes an ambiguous submitted swap without charging ETH twice', async () => {
    vi.mocked(publicClient.waitForTransactionReceipt)
      .mockRejectedValueOnce(new Error('RPC disconnected'))
      .mockResolvedValueOnce({ status: 'success' } as never)

    await expect(executeEthPayment(owner, amountOut, 1_020n)).rejects.toThrow(
      'still pending',
    )
    expect(hasPendingEthPayment(owner)).toBe(true)

    await executeEthPayment(owner, amountOut, 1_020n)
    expect(mocks.sendTransaction).toHaveBeenCalledOnce()
    expect(getEthSwapQuote).toHaveBeenCalledOnce()
    expect(hasPendingEthPayment(owner)).toBe(false)
  })

  it.each([
    ['repriced', true],
    ['cancelled', false],
    ['replaced', false],
  ] as const)(
    'handles a %s wallet transaction without misreporting payment success',
    async (reason, completesPayment) => {
      vi.mocked(publicClient.waitForTransactionReceipt).mockImplementationOnce(
        async ({ onReplaced }) => {
          onReplaced?.({ reason } as never)
          return { status: 'success' } as never
        },
      )

      const payment = executeEthPayment(owner, amountOut, 1_020n)
      if (completesPayment) await expect(payment).resolves.toBeUndefined()
      else await expect(payment).rejects.toThrow(/cancelled|replaced/)
      expect(hasPendingEthPayment(owner)).toBe(false)
    },
  )

  it('accepts a changed transaction only when the wallet has enough USDC', async () => {
    vi.mocked(publicClient.readContract).mockResolvedValue(amountOut as never)
    vi.mocked(publicClient.waitForTransactionReceipt).mockImplementationOnce(
      async ({ onReplaced }) => {
        onReplaced?.({ reason: 'replaced' } as never)
        return { status: 'success' } as never
      },
    )

    await expect(
      executeEthPayment(owner, amountOut, 1_020n),
    ).resolves.toBeUndefined()
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'balanceOf', args: [owner] }),
    )
    expect(hasPendingEthPayment(owner)).toBe(false)
  })

  it('does not submit if the wallet rejects the chain switch', async () => {
    vi.mocked(followChain).mockRejectedValue(new Error('Chain switch rejected'))
    await expect(executeEthPayment(owner, amountOut, 1_020n)).rejects.toThrow(
      'Chain switch rejected',
    )
    expect(mocks.sendTransaction).not.toHaveBeenCalled()
  })
})
