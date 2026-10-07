import type { RhinestoneAccount } from '@rhinestone/sdk'
import { type Chain, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import { HCA_LEG_GAS_LIMITS, HCA_MAX_LEG_FEES_USDC } from './budget'
import { getDestinationContracts, MAX_REFUND_GAS_OVERHEAD } from './manifest'
import {
  findGasRefundViolations,
  isFixableByNewSession,
  LEGACY_REFUND_CAPS,
  MAX_REFUND_GAS_OVERHEAD_CEILING,
  maxQuotedGasOverhead,
  type QuotedGasRefund,
  quoteSessionRefundCaps,
  REFUND_GAS_OVERHEAD_HEADROOM,
  readQuotedGasRefunds,
  sizeRefundCaps,
} from './refund-caps'

const USDC = getDestinationContracts(sepolia.id).usdc
const OTHER_TOKEN = '0x2222222222222222222222222222222222222222'

/**
 * A live Sepolia quote (2026-10-07, base fee ~20 wei): `overhead` packs a
 * 0.020660 USDC refund ceiling over a 2,972,344-gas overhead.
 */
const LIVE_GAS_REFUND = {
  token: USDC,
  exchangeRate: '2568073614',
  overhead: '7030233700586588655153319389540331251653304',
}

const routeWith = (...gasRefunds: unknown[]) => ({
  intentOp: {
    elements: gasRefunds.map((gasRefund) => ({
      mandate: { qualifier: { settlementContext: { gasRefund } } },
    })),
  },
})

const refund = (overrides: Partial<QuotedGasRefund> = {}): QuotedGasRefund => ({
  token: USDC,
  exchangeRate: 2_568_073_614n,
  refundAmount: 20_660n,
  gasOverhead: 400_000n,
  ...overrides,
})

describe('readQuotedGasRefunds', () => {
  it('unpacks the refund amount and gas overhead the way the validator does', () => {
    expect(readQuotedGasRefunds(routeWith(LIVE_GAS_REFUND))).toEqual([
      {
        token: USDC,
        exchangeRate: 2_568_073_614n,
        refundAmount: 20_660n,
        gasOverhead: 2_972_344n,
      },
    ])
  })

  it('reads an element without a refund as the zero refund the SDK signs', () => {
    expect(readQuotedGasRefunds(routeWith(undefined))).toEqual([
      {
        token: zeroAddress,
        exchangeRate: 0n,
        refundAmount: 0n,
        gasOverhead: 0n,
      },
    ])
  })

  it('returns nothing for a route without elements', () => {
    expect(readQuotedGasRefunds(undefined)).toEqual([])
    expect(readQuotedGasRefunds({ intentOp: {} })).toEqual([])
  })
})

describe('findGasRefundViolations', () => {
  it('accepts a refund within every cap', () => {
    expect(findGasRefundViolations(refund(), LEGACY_REFUND_CAPS, USDC)).toEqual(
      [],
    )
  })

  // The overhead the validator rejected on every Sepolia intent once gas fell
  // to ~1 Mwei: 2.97M against the legacy 500k cap.
  it('flags the live cheap-gas overhead against the legacy cap', () => {
    const [quoted] = readQuotedGasRefunds(routeWith(LIVE_GAS_REFUND))
    expect(
      findGasRefundViolations(
        quoted as QuotedGasRefund,
        LEGACY_REFUND_CAPS,
        USDC,
      ),
    ).toEqual([
      {
        field: 'gasOverhead',
        quoted: 2_972_344n,
        cap: MAX_REFUND_GAS_OVERHEAD,
      },
    ])
  })

  it('flags a refund amount over the cap, and a zero one', () => {
    expect(
      findGasRefundViolations(
        refund({ refundAmount: LEGACY_REFUND_CAPS.maxRefundAmount + 1n }),
        LEGACY_REFUND_CAPS,
        USDC,
      ).map((v) => v.field),
    ).toEqual(['refundAmount'])
    expect(
      findGasRefundViolations(
        refund({ refundAmount: 0n }),
        LEGACY_REFUND_CAPS,
        USDC,
      ).map((v) => v.field),
    ).toEqual(['refundAmount'])
  })

  it('flags an exchange rate over the cap, and a zero one', () => {
    expect(
      findGasRefundViolations(
        refund({
          exchangeRate: LEGACY_REFUND_CAPS.maxRefundExchangeRate + 1n,
        }),
        LEGACY_REFUND_CAPS,
        USDC,
      ).map((v) => v.field),
    ).toEqual(['exchangeRate'])
    expect(
      findGasRefundViolations(
        refund({ exchangeRate: 0n }),
        LEGACY_REFUND_CAPS,
        USDC,
      ).map((v) => v.field),
    ).toEqual(['exchangeRate'])
  })

  it('flags a refund in a token other than the session refund token', () => {
    expect(
      findGasRefundViolations(
        refund({ token: OTHER_TOKEN }),
        LEGACY_REFUND_CAPS,
        USDC,
      ).map((v) => v.field),
    ).toEqual(['refundToken'])
  })

  it('accepts no refund, but not a tokenless refund that carries values', () => {
    const none = {
      token: zeroAddress,
      exchangeRate: 0n,
      refundAmount: 0n,
      gasOverhead: 0n,
    }
    expect(findGasRefundViolations(none, LEGACY_REFUND_CAPS, USDC)).toEqual([])
    expect(
      findGasRefundViolations(
        { ...none, gasOverhead: 1n },
        LEGACY_REFUND_CAPS,
        USDC,
      ).map((v) => v.field),
    ).toEqual(['refundToken'])
  })

  it('reports every violation, not only the first', () => {
    expect(
      findGasRefundViolations(
        refund({
          refundAmount: LEGACY_REFUND_CAPS.maxRefundAmount + 1n,
          gasOverhead: MAX_REFUND_GAS_OVERHEAD + 1n,
        }),
        LEGACY_REFUND_CAPS,
        USDC,
      ).map((v) => v.field),
    ).toEqual(['refundAmount', 'gasOverhead'])
  })
})

describe('isFixableByNewSession', () => {
  const overhead = (quoted: bigint) => ({
    field: 'gasOverhead' as const,
    quoted,
    cap: MAX_REFUND_GAS_OVERHEAD,
  })

  it('is true only for an overhead miss within the ceiling', () => {
    expect(isFixableByNewSession([overhead(3_000_000n)])).toBe(true)
    expect(
      isFixableByNewSession([overhead(MAX_REFUND_GAS_OVERHEAD_CEILING + 1n)]),
    ).toBe(false)
  })

  it('is false when any other cap is missed too', () => {
    expect(
      isFixableByNewSession([
        overhead(3_000_000n),
        { field: 'refundAmount', quoted: 200_000_000n, cap: 100_000_000n },
      ]),
    ).toBe(false)
  })

  it('is false with nothing to fix', () => {
    expect(isFixableByNewSession([])).toBe(false)
  })
})

describe('sizeRefundCaps', () => {
  it('is the legacy caps without a quote', () => {
    expect(sizeRefundCaps()).toEqual(LEGACY_REFUND_CAPS)
  })

  it('scales the quoted overhead by the headroom', () => {
    expect(sizeRefundCaps(2_972_344n)).toEqual({
      ...LEGACY_REFUND_CAPS,
      maxRefundGasOverhead: 2_972_344n * REFUND_GAS_OVERHEAD_HEADROOM,
    })
  })

  it('never goes below the legacy overhead cap', () => {
    expect(sizeRefundCaps(52_000n).maxRefundGasOverhead).toBe(
      MAX_REFUND_GAS_OVERHEAD,
    )
  })

  it('never goes above the sanity ceiling', () => {
    expect(
      sizeRefundCaps(MAX_REFUND_GAS_OVERHEAD_CEILING).maxRefundGasOverhead,
    ).toBe(MAX_REFUND_GAS_OVERHEAD_CEILING)
  })
})

describe('maxQuotedGasOverhead', () => {
  it('takes the largest overhead among refunds that carry a token', () => {
    expect(
      maxQuotedGasOverhead([
        refund({ gasOverhead: 10n }),
        refund({ token: zeroAddress, gasOverhead: 99n }),
        refund({ gasOverhead: 30n }),
      ]),
    ).toBe(30n)
  })

  it('is undefined when nothing carries a refund', () => {
    expect(maxQuotedGasOverhead([])).toBeUndefined()
  })
})

describe('quoteSessionRefundCaps', () => {
  const accountReturning = (prepare: () => Promise<unknown>) => {
    const prepareTransaction = vi.fn((_request: Record<string, unknown>) =>
      prepare(),
    )
    return {
      account: { prepareTransaction } as unknown as RhinestoneAccount,
      prepareTransaction,
    }
  }

  it('sizes the caps from the quoted overhead', async () => {
    const { account, prepareTransaction } = accountReturning(async () => ({
      intentRoute: routeWith(LIVE_GAS_REFUND),
    }))
    const result = await quoteSessionRefundCaps({
      rhinestoneAccount: account,
      chain: sepolia as Chain,
    })
    expect(result).toEqual({
      source: 'quote',
      caps: sizeRefundCaps(2_972_344n),
    })

    // Owner-signed, user-paid, and declaring incoming funds so an empty HCA
    // can still be priced.
    const request = prepareTransaction.mock.calls[0]?.[0] ?? {}
    expect(request.signers).toBeUndefined()
    expect(request.feeAsset).toBe('USDC')
    expect(request.gasLimit).toBe(HCA_LEG_GAS_LIMITS.commit)
    expect(request.auxiliaryFunds).toEqual({
      [sepolia.id]: { [USDC]: HCA_MAX_LEG_FEES_USDC },
    })
  })

  it('falls back to the legacy caps when the quote fails', async () => {
    const { account } = accountReturning(async () => {
      throw new Error('orchestrator 500')
    })
    expect(
      await quoteSessionRefundCaps({
        rhinestoneAccount: account,
        chain: sepolia as Chain,
      }),
    ).toEqual({
      source: 'legacy',
      caps: LEGACY_REFUND_CAPS,
      reason: 'orchestrator 500',
    })
  })

  it('falls back to the legacy caps when the quote carries no refund', async () => {
    const { account } = accountReturning(async () => ({
      intentRoute: routeWith(undefined),
    }))
    const result = await quoteSessionRefundCaps({
      rhinestoneAccount: account,
      chain: sepolia as Chain,
    })
    expect(result.source).toBe('legacy')
    expect(result.caps).toEqual(LEGACY_REFUND_CAPS)
  })
})
