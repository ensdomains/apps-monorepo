import type {
  PreparedTransactionData,
  RhinestoneAccount,
} from '@rhinestone/sdk'
import { BadRequestError } from '@rhinestone/sdk/errors'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import {
  type EthSwapRoute,
  EthSwapSubmitError,
  EthSwapUnconfirmedError,
  ethSwapAmountIn,
  ethSwapMaxFee,
  maxEthSwapInput,
  NATIVE_ETH,
  planEthDeposit,
  quoteEthSwap,
  submitEthSwap,
  validateEthSwapQuote,
  validateEthUsdRound,
} from './eth-swap'

const HCA: Address = '0xcD5d6F82dbFDfAdf0f944EE7c0AD9eD9c8e4961d'
const OTHER: Address = '0x6666666666666666666666666666666666666666'
const USDC: Address = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
const WETH: Address = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'
const NOW = 1_800_000_000n
const ETH_USD = 2_000_00000000n // $2,000 with the feed's 8 decimals
const ONE_CENTI_ETH = 10_000_000_000_000_000n

const route: EthSwapRoute = {
  hca: HCA,
  chain: sepolia,
  usdc: USDC,
  amountOut: 20_000_000n,
  maxAmountIn: maxEthSwapInput(20_000_000n, ETH_USD),
  amountIn: 10_200_000_000_000_000n,
}

// Shaped like the orchestrator's JSON: lowercased addresses, decimal strings.
const baseQuote = () => {
  const element = {
    chainId: String(sepolia.id),
    mandate: {
      recipient: HCA.toLowerCase(),
      destinationChainId: String(sepolia.id),
      destinationOps: { vt: '0x', ops: [] as unknown[] },
      preClaimOps: { vt: '0x', ops: [] as unknown[] },
    },
  }
  const spent: Record<string, Record<string, object>> = {
    [String(sepolia.id)]: {
      [NATIVE_ETH]: { locked: '0', unlocked: '10200000000000000', version: 1 },
    },
  }
  const received = [
    {
      tokenAddress: USDC.toLowerCase(),
      hasFulfilled: true,
      amountSpent: '10200000000000000',
      destinationAmount: '20140000',
      fee: '0',
    },
  ]
  return {
    element,
    spent,
    received,
    intentRoute: {
      intentOp: {
        sponsor: HCA.toLowerCase(),
        nonce: '77',
        expires: String(NOW + 300n),
        elements: [element],
      },
      intentCost: { tokensSpent: spent, tokensReceived: received },
    },
  }
}

type Quote = ReturnType<typeof baseQuote>

const validate = (edit: (q: Quote) => void = () => {}, at = route) => {
  const q = baseQuote()
  edit(q)
  return validateEthSwapQuote({
    route: at,
    prepared: {
      intentRoute: q.intentRoute,
    } as unknown as PreparedTransactionData,
    now: NOW,
  })
}

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

describe('maxEthSwapInput', () => {
  it('prices the USDC plus the fee cap at the feed, rounding up', () => {
    // 20 USDC + 2 USDC floor at $2,000 = 0.011 ETH.
    expect(maxEthSwapInput(20_000_000n, ETH_USD)).toBe(11_000_000_000_000_000n)
    expect(maxEthSwapInput(1n, 3n * 10n ** 8n)).toBe(
      (2_000_001n * 10n ** 20n + 3n * 10n ** 8n - 1n) / (3n * 10n ** 8n),
    )
  })

  it('caps the fee at 3%, at least 2 USDC', () => {
    expect(ethSwapMaxFee(20_000_000n)).toBe(2_000_000n)
    expect(ethSwapMaxFee(1_000_000_000n)).toBe(30_000_000n)
  })
})

describe('planEthDeposit', () => {
  it.each([
    ['the quote plus the buffer', 0n, 10_150_000_000_000_000n],
    [
      'less what the HCA already holds',
      4n * 10n ** 15n,
      6_150_000_000_000_000n,
    ],
    ['nothing once the HCA holds enough', 2n * ONE_CENTI_ETH, 0n],
  ])('sends %s', (_case, hcaEthBalance, deposit) => {
    expect(
      planEthDeposit({
        quotedAmountIn: ONE_CENTI_ETH,
        maxAmountIn: 2n * ONE_CENTI_ETH,
        hcaEthBalance,
      }),
    ).toBe(deposit)
  })

  it('never sends past the Chainlink bound', () => {
    expect(
      planEthDeposit({
        quotedAmountIn: ONE_CENTI_ETH,
        maxAmountIn: ONE_CENTI_ETH + 1n,
        hcaEthBalance: 0n,
      }),
    ).toBe(ONE_CENTI_ETH + 1n)
  })
})

describe('ethSwapAmountIn', () => {
  it.each([
    [ONE_CENTI_ETH, 2n * ONE_CENTI_ETH, ONE_CENTI_ETH],
    [3n * ONE_CENTI_ETH, 2n * ONE_CENTI_ETH, 2n * ONE_CENTI_ETH],
  ])('spends %s held, bounded by %s, as %s', (hcaEthBalance, max, amountIn) => {
    expect(ethSwapAmountIn({ hcaEthBalance, maxAmountIn: max })).toBe(amountIn)
  })
})

describe('validateEthSwapQuote', () => {
  it('accepts a swap of the HCA ETH into its USDC', () => {
    expect(validate()._unsafeUnwrap()).toMatchObject({
      amountIn: 10_200_000_000_000_000n,
      amountOut: 20_140_000n,
      expires: NOW + 300n,
    })
  })

  it.each<[string, (q: Quote) => void, string]>([
    [
      'another sponsor',
      (q) => {
        q.intentRoute.intentOp.sponsor = OTHER
      },
      'another account',
    ],
    [
      'no elements',
      (q) => {
        q.intentRoute.intentOp.elements = []
      },
      'empty',
    ],
    [
      'an element on another chain',
      (q) => {
        q.element.chainId = '1'
      },
      'another account or chain',
    ],
    [
      'another recipient',
      (q) => {
        q.element.mandate.recipient = OTHER
      },
      'another account or chain',
    ],
    [
      'destination calls',
      (q) => {
        q.element.mandate.destinationOps.ops = [{ to: OTHER }]
      },
      'other operations',
    ],
    [
      'calls before the claim',
      (q) => {
        q.element.mandate.preClaimOps.ops = [{ to: OTHER }]
      },
      'other operations',
    ],
    [
      'a quote about to expire',
      (q) => {
        q.intentRoute.intentOp.expires = String(NOW + 30n)
      },
      'expired',
    ],
    [
      'a token other than ETH spent',
      (q) => {
        q.spent[String(sepolia.id)] = {
          [WETH]: { locked: '0', unlocked: '1' },
        }
      },
      'other than your ETH',
    ],
    [
      'ETH spent on another chain',
      (q) => {
        q.spent['1'] = { [NATIVE_ETH]: { locked: '0', unlocked: '1' } }
      },
      'other than your ETH',
    ],
    [
      'nothing spent',
      (q) => {
        delete q.spent[String(sepolia.id)]
      },
      'other than your ETH',
    ],
    [
      'more ETH than the Chainlink bound',
      (q) => {
        q.spent[String(sepolia.id)] = {
          [NATIVE_ETH]: { locked: '0', unlocked: '11000000000000001' },
        }
      },
      'exchange rate is too high',
    ],
    [
      'less USDC than needed',
      (q) => {
        q.received[0] = { ...q.received[0], destinationAmount: '19999999' }
      },
      'less USDC',
    ],
    [
      'another token delivered',
      (q) => {
        q.received[0] = { ...q.received[0], tokenAddress: WETH }
      },
      'less USDC',
    ],
    [
      'a second token delivered',
      (q) => {
        q.received.push({ ...q.received[0], tokenAddress: OTHER })
      },
      'less USDC',
    ],
  ])('refuses %s', (_case, edit, message) => {
    expect(validate(edit)._unsafeUnwrapErr().message).toContain(message)
  })

  it('refuses spending more than the ETH sent', () => {
    const result = validate(() => {}, {
      ...route,
      amountIn: 10_199_999_999_999_999n,
    })
    expect(result._unsafeUnwrapErr().message).toContain(
      'more ETH than was sent',
    )
  })
})

const fakeAccount = () => {
  const quote = baseQuote()
  return {
    account: {
      prepareTransaction: vi.fn(async () => ({
        intentRoute: quote.intentRoute,
      })),
      signTransaction: vi.fn(async (prepared: object) => ({
        ...prepared,
        originSignatures: ['0x01'],
        destinationSignature: '0x01',
      })),
      submitTransaction: vi.fn(async () => ({
        type: 'intent',
        id: 42n,
        targetChain: sepolia.id,
      })),
    },
  }
}
const asAccount = (account: object) => account as unknown as RhinestoneAccount

describe('quoteEthSwap', () => {
  const shared = {
    sourceChains: [sepolia],
    targetChain: sepolia,
    calls: [],
    sponsored: { gas: false, bridging: false, swaps: false },
    feeAsset: NATIVE_ETH,
  }

  it('swaps exactly the ETH sent into as much USDC as it buys', async () => {
    const { account } = fakeAccount()
    await quoteEthSwap(asAccount(account), route, () => NOW)
    expect(account.prepareTransaction).toHaveBeenCalledWith({
      ...shared,
      sourceAssets: [
        { chain: sepolia, address: NATIVE_ETH, amount: route.amountIn },
      ],
      tokenRequests: [{ address: USDC }],
    })
  })

  it('sizes the swap for the USDC needed, declaring ETH still to arrive', async () => {
    const { account } = fakeAccount()
    await quoteEthSwap(
      asAccount(account),
      { ...route, amountIn: undefined, pendingDeposit: ONE_CENTI_ETH },
      () => NOW,
    )
    expect(account.prepareTransaction).toHaveBeenCalledWith({
      ...shared,
      sourceAssets: { [sepolia.id]: [NATIVE_ETH] },
      tokenRequests: [{ address: USDC, amount: 20_000_000n }],
      auxiliaryFunds: { [sepolia.id]: { [NATIVE_ETH]: ONE_CENTI_ETH } },
    })
  })
})

describe('submitEthSwap', () => {
  const quoted = async (account: ReturnType<typeof fakeAccount>['account']) =>
    (await quoteEthSwap(asAccount(account), route, () => NOW))._unsafeUnwrap()

  it('submits a timely signature and returns the intent', async () => {
    const { account } = fakeAccount()
    const result = await submitEthSwap(
      asAccount(account),
      await quoted(account),
      () => NOW + 60n,
    )
    expect(result._unsafeUnwrap()).toMatchObject({ id: 42n })
  })

  it('does not submit a signature that lands near expiry', async () => {
    const { account } = fakeAccount()
    const result = await submitEthSwap(
      asAccount(account),
      await quoted(account),
      () => NOW + 271n,
    )
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(EthSwapSubmitError)
    expect(account.submitTransaction).not.toHaveBeenCalled()
  })

  it('reports a refused submission as not sent', async () => {
    const { account } = fakeAccount()
    const quote = await quoted(account)
    account.submitTransaction.mockRejectedValueOnce(
      new BadRequestError({ statusCode: 400 }),
    )
    const result = await submitEthSwap(asAccount(account), quote, () => NOW)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(EthSwapSubmitError)
  })

  it('reports a lost response as unconfirmed, with the intent id', async () => {
    const { account } = fakeAccount()
    const quote = await quoted(account)
    account.submitTransaction.mockRejectedValueOnce(
      new TypeError('fetch failed'),
    )
    const result = await submitEthSwap(asAccount(account), quote, () => NOW)
    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(EthSwapUnconfirmedError)
    expect((error as EthSwapUnconfirmedError).intentId).toBe(77n)
  })
})
