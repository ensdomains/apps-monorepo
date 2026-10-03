import type { PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import {
  estimateHcaBudget,
  HCA_LEG_GAS_LIMITS,
  HCA_MAX_LEG_FEES_USDC,
  HCA_RESOLVER_DEPLOY_GAS,
  HcaBudgetExceedsMaximumError,
  hcaBudgetMaximum,
  primaryNameGas,
  type QuoteLegResult,
  type QuoteMarketData,
  registerLegGasLimit,
  withBudgetDrift,
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
  // The deploy-specific cases below override this.
  isResolverDeployed: true,
})

/** ETH at $3000, USDC at $1, 2 gwei — the shape `signedMetadata` carries. */
const market = (gasPriceWei: bigint): QuoteMarketData => ({
  ethUsd8: 3000n * 100_000_000n,
  usdcUsd8: 100_000_000n,
  gasPriceWei,
})

describe('estimateHcaBudget', () => {
  it('sizes the permit from the orchestrator quotes and the price, with no buffer', async () => {
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
    // Both quotes price the real batches, so nothing is added on top.
    expect(breakdown.total).toBe(USDC(4) + USDC(6) + USDC(5))
  })

  it('declares the expected inflow to both legs so a low-balance HCA can be priced', async () => {
    // Without this the planner sees an HCA that cannot cover the intent and
    // refuses to quote at all (NO_PLAN_AVAILABLE), because the funding arrives
    // mid-intent via permit + transferFrom and is invisible to it up front.
    const declared: Record<string, bigint | undefined> = {}

    await estimateHcaBudget({
      ...baseParams(USDC(5)),
      hcaBalanceUsdc: 0n,
      quoteLegCostUsdc: async (leg, incomingUsdc) => {
        declared[leg] = incomingUsdc
        return { spendUsdc: USDC(1) }
      },
    })

    // price + both flat per-leg fallbacks, since the real leg costs are the
    // very thing being quoted here.
    expect(declared.commit).toBeGreaterThan(USDC(5))
    // The reveal is quoted before the commit has funded the HCA, so it needs
    // the same declaration.
    expect(declared.register).toBe(declared.commit)
  })

  it('does not declare funds the HCA already holds', async () => {
    // Double-counting the standing balance inflates the planner's view and
    // therefore the quote.
    const seen: bigint[] = []

    await estimateHcaBudget({
      ...baseParams(USDC(5)),
      hcaBalanceUsdc: USDC(4),
      quoteLegCostUsdc: async (_leg, incomingUsdc) => {
        seen.push(incomingUsdc ?? 0n)
        return { spendUsdc: USDC(1) }
      },
    })

    const withoutBalance = seen[0] as bigint

    const unfunded: bigint[] = []
    await estimateHcaBudget({
      ...baseParams(USDC(5)),
      hcaBalanceUsdc: 0n,
      quoteLegCostUsdc: async (_leg, incomingUsdc) => {
        unfunded.push(incomingUsdc ?? 0n)
        return { spendUsdc: USDC(1) }
      },
    })

    expect(withoutBalance).toBe((unfunded[0] as bigint) - USDC(4))
  })

  it('declares nothing when the HCA already covers the whole budget', async () => {
    // An already-funded HCA needs no permit, so there is no inflow to declare —
    // and declaring one would be a lie the planner prices against.
    const seen: (bigint | undefined)[] = []

    await estimateHcaBudget({
      ...baseParams(USDC(5)),
      hcaBalanceUsdc: USDC(500),
      quoteLegCostUsdc: async (_leg, incomingUsdc) => {
        seen.push(incomingUsdc)
        return { spendUsdc: USDC(1) }
      },
    })

    expect(seen).toEqual([0n, 0n])
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
    expect(breakdown.total).toBe(USDC(5) + USDC(5) + USDC(5))
    // A silent fallback over-funds, so the reason must be reported.
    expect(breakdown.fallbackReasons).toEqual([
      'commit: no quoter available',
      'register: no quoter available',
      'no quote market data (flat per-leg fee used)',
    ])
  })

  it('refuses a quote above the expected maximum', async () => {
    // The leg costs come straight out of an orchestrator HTTP response and are
    // summed into the value of a permit the user signs. A response that prices
    // the legs absurdly must produce no budget at all — clamping it would still
    // hand the wallet a number this code does not believe.
    const overshoot = {
      ...baseParams(USDC(5)),
      quoteLegCostUsdc: async (): Promise<QuoteLegResult> => ({
        spendUsdc: HCA_MAX_LEG_FEES_USDC,
      }),
    }

    await expect(estimateHcaBudget(overshoot)).rejects.toThrow(
      HcaBudgetExceedsMaximumError,
    )
  })

  it('pins the leg-fee ceiling at 25 USDC', async () => {
    // The other ceiling tests feed the constant back into itself, so they stay
    // green whatever it is set to. These use literals on purpose: raising the
    // ceiling (e.g. for mainnet, see the REVISIT ON MAINNET note on
    // HCA_MAX_LEG_FEES_USDC in budget.ts) must be a deliberate edit here too.
    expect(HCA_MAX_LEG_FEES_USDC).toBe(25_000_000n)

    // 13 USDC per leg = 26 USDC of fees, just over the ceiling.
    await expect(
      estimateHcaBudget({
        ...baseParams(USDC(5)),
        quoteLegCostUsdc: async () => ({ spendUsdc: 13_000_000n }),
      }),
    ).rejects.toThrow(HcaBudgetExceedsMaximumError)
  })

  it('reports the ceiling it accepted the budget under', async () => {
    const breakdown = await estimateHcaBudget({
      ...baseParams(USDC(5)),
      quoteLegCostUsdc: async () => ({ spendUsdc: USDC(2) }),
    })

    // Derived from OUR on-chain price read, never from the quote — so the
    // permit can be bounded by it without trusting the response twice.
    expect(breakdown.expectedMaximum).toBe(USDC(5) + HCA_MAX_LEG_FEES_USDC)
    expect(breakdown.expectedMaximum).toBe(hcaBudgetMaximum(USDC(5)))
    expect(breakdown.total).toBeLessThan(breakdown.expectedMaximum)
  })

  it('accepts a realistic quote well inside the ceiling', async () => {
    // Live Sepolia fills: ~0.9 USDC commit, ~3.3 USDC register. The bound must
    // not be so tight that a healthy route trips it.
    const breakdown = await estimateHcaBudget({
      ...baseParams(USDC(8)),
      quoteLegCostUsdc: async (leg) => ({
        spendUsdc: leg === 'commit' ? 905_736n : 3_277_666n,
      }),
    })

    expect(breakdown.total).toBe(USDC(8) + 905_736n + 3_277_666n)
    expect(breakdown.total).toBeLessThan(breakdown.expectedMaximum)
  })

  it('widens a displayed figure by the drift allowance, never narrows it', async () => {
    // Checkout and the machine each take their own quote, so the two
    // legitimately disagree as gas moves. The allowance is one-directional.
    expect(withBudgetDrift(USDC(10))).toBe(USDC(12) + USDC(1) / 2n)
    expect(withBudgetDrift(0n)).toBe(0n)
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

  it('prices the resolver deploy into the register leg on a first registration', async () => {
    // Immunefi #89462: a flat 450k limit never funded the conditional
    // `deployProxy` a first registration carries.
    const budgetFor = (isResolverDeployed: boolean) =>
      estimateHcaBudget({
        ...baseParams(USDC(5)),
        isResolverDeployed,
        quoteLegCostUsdc: async () => ({
          spendUsdc: null,
          market: market(2_000_000_000n),
        }),
      })

    const fresh = await budgetFor(false)
    const existing = await budgetFor(true)

    // 210k gas × 2 gwei × $3000/ETH ÷ $1/USDC = 1.26 USDC, previously unfunded.
    expect(fresh.registerCost - existing.registerCost).toBe(1_260_000n)
    expect(fresh.total).toBeGreaterThan(existing.total)
  })
})

describe('registerLegGasLimit', () => {
  it('funds the resolver deploy only when the resolver does not exist yet', () => {
    // This number, not the batch handed to the quoter, is what funds the leg.
    expect(registerLegGasLimit({ isResolverDeployed: true })).toBe(
      HCA_LEG_GAS_LIMITS.register,
    )
    expect(registerLegGasLimit({ isResolverDeployed: false })).toBe(
      HCA_LEG_GAS_LIMITS.register + HCA_RESOLVER_DEPLOY_GAS,
    )
  })

  it('covers the deploy and a primary name together', () => {
    // A first registration with the opt-in carries both extra calls.
    expect(
      registerLegGasLimit({
        isResolverDeployed: false,
        primaryName: 'myname.eth',
      }),
    ).toBe(
      HCA_LEG_GAS_LIMITS.register +
        HCA_RESOLVER_DEPLOY_GAS +
        primaryNameGas('myname.eth'),
    )
  })

  it('stays at or above the measured on-chain cost of the deploy', () => {
    // Measured on Sepolia; the constant must not drift below it.
    expect(HCA_RESOLVER_DEPLOY_GAS).toBeGreaterThanOrEqual(185_904n)
  })
})
