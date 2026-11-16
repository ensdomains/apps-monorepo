import { decodeFunctionData, parseAbi } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  buildEthSwapCall,
  EthSwapRejectedError,
  EthSwapUnavailableError,
  ethSwapMaxFee,
  ethToUsdcRaw,
  maxEthSwapInput,
  selectEthSwapQuote,
  validateEthUsdRound,
} from './eth-usdc-swap'

const NOW = 1_800_000_000n
const ETH_USD = 2_000_00000000n // $2,000 with the feed's 8 decimals
const AMOUNT_OUT = 20_000_000n
// 20 USDC + the 2 USDC fee floor at $2,000.
const MAX_IN = 11_000_000_000_000_000n
const OWNER = '0x1111111111111111111111111111111111111111'

describe('validateEthUsdRound', () => {
  const round = {
    roundId: 10n,
    answer: ETH_USD,
    updatedAt: NOW - 60n,
    answeredInRound: 10n,
  }

  it('reads a fresh answer', () => {
    expect(validateEthUsdRound(round, NOW, 3_600n)._unsafeUnwrap()).toBe(
      ETH_USD,
    )
  })

  it.each([
    ['a non-positive answer', { answer: 0n }],
    ['an answer from an earlier round', { answeredInRound: 9n }],
    ['no update time', { updatedAt: 0n }],
    ['an update from the future', { updatedAt: NOW + 1n }],
    ['a stale update', { updatedAt: NOW - 3_601n }],
  ])('refuses %s', (_case, override) => {
    expect(
      validateEthUsdRound({ ...round, ...override }, NOW, 3_600n).isErr(),
    ).toBe(true)
  })
})

describe('ethToUsdcRaw', () => {
  it.each([
    ['one ETH', 10n ** 18n, 2_000_000_000n],
    ['a fraction, rounded down', 1_234_567_890_123n, 2_469n],
    ['nothing', 0n, 0n],
  ])('values %s at the feed price', (_case, wei, usdc) => {
    expect(ethToUsdcRaw(wei, ETH_USD)).toBe(usdc)
  })
})

describe('maxEthSwapInput', () => {
  it('prices the USDC plus the fee cap at the feed', () => {
    expect(maxEthSwapInput(AMOUNT_OUT, ETH_USD)).toBe(MAX_IN)
  })

  it('caps the fee at 3%, at least 2 USDC', () => {
    expect(ethSwapMaxFee(20_000_000n)).toBe(2_000_000n)
    expect(ethSwapMaxFee(1_000_000_000n)).toBe(30_000_000n)
  })
})

describe('selectEthSwapQuote', () => {
  it('takes the cheapest pool that routes, allowing 2% slippage', () => {
    const quote = selectEthSwapQuote({
      amountOut: AMOUNT_OUT,
      maxAmountIn: MAX_IN,
      poolQuotes: [
        { fee: 500, amountIn: 10_100_000_000_000_000n },
        { fee: 3000, amountIn: 10_000_000_000_000_000n },
        { fee: 10000, amountIn: 0n },
      ],
    })._unsafeUnwrap()
    expect(quote).toEqual({
      amountOut: AMOUNT_OUT,
      amountIn: 10_000_000_000_000_000n,
      maximumEth: 10_200_000_000_000_000n,
      fee: 3000,
    })
  })

  it.each([
    ['no pool', []],
    ['only empty pools', [{ fee: 500 as const, amountIn: 0n }]],
  ])('has no swap with %s', (_case, poolQuotes) => {
    expect(
      selectEthSwapQuote({
        amountOut: AMOUNT_OUT,
        maxAmountIn: MAX_IN,
        poolQuotes,
      })._unsafeUnwrapErr(),
    ).toBeInstanceOf(EthSwapUnavailableError)
  })

  it('refuses a pool whose slippage limit passes the Chainlink bound', () => {
    // 1.02 × this is one wei over the bound.
    const amountIn = (MAX_IN * 10_000n) / 10_200n + 1n
    expect(
      selectEthSwapQuote({
        amountOut: AMOUNT_OUT,
        maxAmountIn: MAX_IN,
        poolQuotes: [{ fee: 500, amountIn }],
      })._unsafeUnwrapErr(),
    ).toBeInstanceOf(EthSwapRejectedError)
  })
})

describe('buildEthSwapCall', () => {
  const routerAbi = parseAbi([
    'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)',
    'function refundETH() payable',
    'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)',
  ])
  const quote = {
    amountOut: AMOUNT_OUT,
    amountIn: 10_000_000_000_000_000n,
    maximumEth: 10_200_000_000_000_000n,
    fee: 500 as const,
  }

  // Circle's USDC on both chains: Sepolia's manifest MockUSDC has no pool.
  it.each([
    [
      sepolia.id,
      '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
      '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    ],
    [
      mainnet.id,
      '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    ],
  ])(
    'buys exactly the USDC for the wallet on chain %i, then refunds unused ETH',
    (chainId, router, usdc) => {
      const call = buildEthSwapCall({
        quote,
        chainId,
        recipient: OWNER,
        deadline: NOW + 1_200n,
      })._unsafeUnwrap()
      expect(call.to).toBe(router)
      expect(call.value).toBe(quote.maximumEth)

      const outer = decodeFunctionData({ abi: routerAbi, data: call.data })
      if (outer.functionName !== 'multicall') throw new Error('not multicall')
      const [deadline, [swap, refund]] = outer.args
      expect(deadline).toBe(NOW + 1_200n)
      const inner = decodeFunctionData({ abi: routerAbi, data: swap ?? '0x' })
      expect(inner.args?.[0]).toMatchObject({
        tokenOut: usdc,
        recipient: OWNER,
        amountOut: AMOUNT_OUT,
        amountInMaximum: quote.maximumEth,
        fee: 500,
      })
      expect(
        decodeFunctionData({ abi: routerAbi, data: refund ?? '0x' })
          .functionName,
      ).toBe('refundETH')
    },
  )

  it('refuses a chain without a known router', () => {
    expect(
      buildEthSwapCall({
        quote,
        chainId: 10,
        recipient: OWNER,
        deadline: NOW,
      }).isErr(),
    ).toBe(true)
  })
})
