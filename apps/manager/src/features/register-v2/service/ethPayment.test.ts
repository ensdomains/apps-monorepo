import { getDestinationContracts } from '@ens-apps/smart-account'
import { decodeFunctionData, parseAbi } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chain } from '@/config'
import { publicClient } from '@/lib/wagmi'
import {
  assertFreshEthQuote,
  buildEthSwapCall,
  type EthSwapQuote,
  getEthSwapQuote,
  selectEthSwapQuote,
} from './ethPayment'

vi.mock('@/lib/wagmi', () => ({
  publicClient: { readContract: vi.fn() },
}))

const now = 1_800_000_000_000
const amountOut = 2_000_000n // $2 of USDC at six decimals
const ethUsd8 = 200_000_000_000n // $2,000 per ETH
const fairEth = 1_000_000_000_000_000n
const quote = (overrides: Partial<EthSwapQuote> = {}): EthSwapQuote => ({
  amountOut,
  amountIn: fairEth,
  maximumEth: 1_020_000_000_000_000n,
  fee: 500,
  quotedAt: now,
  ...overrides,
})

describe('ETH payment quote bounds', () => {
  it('chooses the cheapest live pool and caps ETH at 2% above its quote', () => {
    const result = selectEthSwapQuote(
      amountOut,
      ethUsd8,
      [
        { fee: 500, amountIn: 1_010_000_000_000_000n },
        { fee: 3000, amountIn: fairEth },
        { fee: 10000, amountIn: 0n },
      ],
      now,
    )
    expect(result.fee).toBe(3000)
    expect(result.maximumEth).toBe(1_020_000_000_000_000n)
  })

  it.each([
    [0n, ethUsd8, [{ fee: 500 as const, amountIn: fairEth }]],
    [amountOut, 0n, [{ fee: 500 as const, amountIn: fairEth }]],
    [amountOut, ethUsd8, []],
    [amountOut, ethUsd8, [{ fee: 500 as const, amountIn: 0n }]],
  ])('refuses an absent or invalid price', (output, oracle, pools) => {
    expect(() => selectEthSwapQuote(output, oracle, pools, now)).toThrow()
  })

  it('refuses a pool quote more than 10% above the independent ETH/USD price', () => {
    expect(() =>
      selectEthSwapQuote(
        amountOut,
        ethUsd8,
        [{ fee: 500, amountIn: 1_100_000_000_000_000n }],
        now,
      ),
    ).toThrow('exchange rate is too high')
  })

  it('does not accept a quote older than 30 seconds', () => {
    expect(() => assertFreshEthQuote(quote(), now + 30_000)).not.toThrow()
    expect(() => assertFreshEthQuote(quote(), now + 30_001)).toThrow('expired')
    expect(() => assertFreshEthQuote(quote(), now - 1)).toThrow('expired')
  })
})

describe('Uniswap ETH to USDC call', () => {
  const routerAbi = parseAbi([
    'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)',
    'function refundETH() payable',
    'function multicall(bytes[] data) payable returns (bytes[] results)',
  ])
  const owner = '0x1111111111111111111111111111111111111111'

  it('buys the exact USDC amount for the owner and refunds unused ETH atomically', () => {
    const call = buildEthSwapCall(quote(), owner)
    const outer = decodeFunctionData({ abi: routerAbi, data: call.data })
    expect(outer.functionName).toBe('multicall')
    expect(call.value).toBe(quote().maximumEth)
    if (outer.functionName !== 'multicall')
      throw new Error('Expected multicall')
    const [swap, refund] = outer.args[0]
    if (!swap || !refund) throw new Error('Missing swap or refund call')
    const inner = decodeFunctionData({ abi: routerAbi, data: swap })
    expect(inner.functionName).toBe('exactOutputSingle')
    if (inner.functionName !== 'exactOutputSingle')
      throw new Error('Expected swap')
    expect(inner.args[0]).toMatchObject({
      tokenOut: getDestinationContracts(chain.id).usdc,
      recipient: owner,
      amountOut,
      amountInMaximum: quote().maximumEth,
      fee: 500,
    })
    expect(
      decodeFunctionData({ abi: routerAbi, data: refund }).functionName,
    ).toBe('refundETH')
  })
})

describe('on-chain quote reads', () => {
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.mocked(publicClient.readContract).mockReset()
  })

  it('uses healthy oracle data and ignores pools with no route', async () => {
    vi.mocked(publicClient.readContract).mockImplementation(async (request) => {
      if (request.functionName === 'latestRoundData') {
        return [10n, ethUsd8, 0n, BigInt(now / 1000 - 60), 10n] as never
      }
      if (request.functionName === 'quoteExactOutputSingle') {
        const fee = (request.args?.[0] as { fee?: number } | undefined)?.fee
        if (fee === 500) throw new Error('No pool')
        return [fee === 3000 ? fairEth : fairEth * 2n, 0n, 0, 0n] as never
      }
      throw new Error('Unexpected contract read')
    })
    expect((await getEthSwapQuote(amountOut)).fee).toBe(3000)
  })

  it.each([
    [0n, BigInt(now / 1000 - 60), 10n],
    [ethUsd8, BigInt(now / 1000 - 86_401), 10n],
    [ethUsd8, BigInt(now / 1000 - 60), 9n],
  ])(
    'refuses an invalid or stale oracle round',
    async (answer, updatedAt, answeredInRound) => {
      vi.mocked(publicClient.readContract).mockResolvedValue([
        10n,
        answer,
        0n,
        updatedAt,
        answeredInRound,
      ] as never)
      await expect(getEthSwapQuote(amountOut)).rejects.toThrow('price feed')
      expect(publicClient.readContract).toHaveBeenCalledTimes(1)
    },
  )

  it('refuses when every pool quote fails', async () => {
    vi.mocked(publicClient.readContract)
      .mockResolvedValueOnce([
        10n,
        ethUsd8,
        0n,
        BigInt(now / 1000),
        10n,
      ] as never)
      .mockRejectedValue(new Error('No pool'))
    await expect(getEthSwapQuote(amountOut)).rejects.toThrow('No ETH to USDC')
  })
})
