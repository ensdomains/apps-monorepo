import type { PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import {
  estimateHcaBudget,
  type QuoteLegResult,
  type QuoteMarketData,
} from './budget'

const USDC = (whole: number) => BigInt(whole) * 1_000_000n

/** `getRegisterPrice` returns `[base, premium]`; the budget uses the sum. */
const publicClientWithPrice = (price: bigint) =>
  ({
    readContract: vi.fn().mockResolvedValue([price, 0n]),
  }) as unknown as PublicClient

const baseParams = (price: bigint) => ({
  publicClient: publicClientWithPrice(price),
  chainId: sepolia.id,
  label: 'myname',
  duration: 31_536_000n,
})

/** ETH at $3000, USDC at $1, 2 gwei — the shape `signedMetadata` carries. */
const market = (gasPriceWei: bigint): QuoteMarketData => ({
  ethUsd8: 3000n * 100_000_000n,
  usdcUsd8: 100_000_000n,
  gasPriceWei,
})

describe('estimateHcaBudget', () => {
  it('sizes the permit from the orchestrator quote plus a 3% register buffer', async () => {
    const quotes: Record<string, QuoteLegResult> = {
      commit: { spendUsdc: USDC(4) },
      register: { spendUsdc: USDC(6) },
    }

    const breakdown = await estimateHcaBudget({
      ...baseParams(USDC(5)),
      quoteLegCostUsdc: async (leg) => quotes[leg] ?? null,
    })

    expect(breakdown.source).toBe('quote')
    expect(breakdown.fallbackReasons).toBeUndefined()
    expect(breakdown.commitCost).toBe(USDC(4))
    expect(breakdown.registerCost).toBe(USDC(6))
    // Buffer applies to the register leg only (gas drift over the cooldown).
    expect(breakdown.registerBuffer).toBe(180_000n)
    expect(breakdown.total).toBe(USDC(4) + USDC(6) + 180_000n + USDC(5))
  })

  it('prices an unquotable leg off the other leg’s market data, not the flat fee', async () => {
    // A first-time (unfunded) HCA cannot be priced, so the commit leg comes
    // back with market data but no spend amount. Falling through to the flat
    // 5 USDC/leg fee here is what over-funded the HCA ~5x.
    const breakdown = await estimateHcaBudget({
      ...baseParams(USDC(5)),
      quoteLegCostUsdc: async (leg) =>
        leg === 'commit'
          ? { spendUsdc: null, market: market(2_000_000_000n) }
          : { spendUsdc: USDC(6), market: market(2_000_000_000n) },
    })

    expect(breakdown.source).toBe('mixed')
    // 450k gas × 2 gwei × $3000/ETH ÷ $1/USDC = 2.7 USDC.
    expect(breakdown.commitCost).toBe(2_700_000n)
    expect(breakdown.commitCost).toBeLessThan(USDC(5))
    expect(breakdown.fallbackReasons).toEqual([
      'commit: quote returned no spend amount',
    ])
  })

  it('clamps a spiky gas price when falling back to the gas-limit model', async () => {
    const budgetAtGasPrice = (gasPriceWei: bigint) =>
      estimateHcaBudget({
        ...baseParams(USDC(5)),
        quoteLegCostUsdc: async () => ({
          spendUsdc: null,
          market: market(gasPriceWei),
        }),
      })

    // Sepolia's `getGasPrice()` spikes to ~20 gwei even when the fill settles
    // at ~1-2 gwei; the estimate must not track the spike past the 5 gwei cap.
    const spiky = await budgetAtGasPrice(20_000_000_000n)
    const capped = await budgetAtGasPrice(5_000_000_000n)

    expect(spiky.total).toBe(capped.total)
  })

  it('falls back to a flat per-leg fee with a stated reason when no quoter is wired', async () => {
    const breakdown = await estimateHcaBudget(baseParams(USDC(5)))

    expect(breakdown.source).toBe('fallback')
    expect(breakdown.commitCost).toBe(USDC(5))
    expect(breakdown.registerCost).toBe(USDC(5))
    expect(breakdown.total).toBe(USDC(5) + USDC(5) + 150_000n + USDC(5))
    // A silent fallback over-funds, so the reason must be reported.
    expect(breakdown.fallbackReasons).toEqual([
      'commit: no quoter available',
      'register: no quoter available',
      'no quote market data (flat per-leg fee used)',
    ])
  })

  it('survives a throwing quoter and reports the failure', async () => {
    const breakdown = await estimateHcaBudget({
      ...baseParams(USDC(5)),
      quoteLegCostUsdc: async () => {
        throw new Error('orchestrator 500')
      },
    })

    expect(breakdown.source).toBe('fallback')
    expect(breakdown.fallbackReasons).toContain(
      'commit: quote threw — orchestrator 500',
    )
  })
})
