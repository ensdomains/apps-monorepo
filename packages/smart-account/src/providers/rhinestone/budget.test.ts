import type { PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import {
  commitLegGasLimit,
  estimateHcaBudget,
  HCA_ACCOUNT_DEPLOY_GAS,
  HCA_LEG_GAS_LIMITS,
  HCA_MAX_LEG_FEES_USDC,
  HCA_RESOLVER_DEPLOY_GAS,
  HcaBudgetExceedsMaximumError,
  hcaBudgetMaximum,
  legFeeUsdc,
  primaryNameGas,
  type QuoteLegResult,
  type QuoteMarketData,
  registerLegGasLimit,
  withBudgetDrift,
} from './budget'
import { getDestinationContracts } from './manifest'
import type { QuotedGasRefund } from './refund-caps'

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
  // The deploy-specific cases below override these.
  isResolverDeployed: true,
  isHcaDeployed: true,
})

/** USDC at $1 and ETH at `ethUsd` — the shape `signedMetadata` carries. */
const market = (gasPriceWei: bigint, ethUsd = 3000n): QuoteMarketData => ({
  ethUsd8: ethUsd * 100_000_000n,
  usdcUsd8: 100_000_000n,
  gasPriceWei,
})

/**
 * A market where the gas-limit model prices a leg above the per-chain floor,
 * so the cases below can observe the limits at all. The floor is worth 1.8 x
 * 1.55M gas, which at an equal gas price outweighs any single leg.
 */
const unflooredMarket = () => market(5_000_000_000n, 1000n)

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
    // A leg the planner cannot price comes back with market data but no spend
    // amount. Falling through to the flat 5 USDC/leg fee is what over-funded
    // the HCA ~5x. Asserted on the register leg: the commit leg is always
    // below the per-chain floor, so the model is not observable there.
    const breakdown = await estimateHcaBudget({
      ...baseParams(USDC(5)),
      quoteLegCostUsdc: async (leg) =>
        leg === 'register'
          ? { spendUsdc: null, market: unflooredMarket() }
          : { spendUsdc: USDC(6), market: unflooredMarket() },
    })

    expect(breakdown.source).toBe('mixed')
    // 1.25M gas × 5 gwei × $1000/ETH ÷ $1/USDC = 6.25 USDC, not the flat fee.
    expect(breakdown.registerCost).toBe(6_250_000n)
    expect(breakdown.fallbackReasons).toEqual([
      'register: quote returned no spend amount',
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

  it('pins the leg-fee ceiling at 45 USDC', async () => {
    // The other ceiling tests feed the constant back into itself, so they stay
    // green whatever it is set to. These use literals on purpose: raising the
    // ceiling (e.g. for mainnet, see the REVISIT ON MAINNET note on
    // HCA_MAX_LEG_FEES_USDC in budget.ts) must be a deliberate edit here too.
    expect(HCA_MAX_LEG_FEES_USDC).toBe(45_000_000n)

    // 23 USDC per leg = 46 USDC of fees, just over the ceiling.
    await expect(
      estimateHcaBudget({
        ...baseParams(USDC(5)),
        quoteLegCostUsdc: async () => ({ spendUsdc: 23_000_000n }),
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

  // Literals on purpose, like the ceiling test: the rail prices each leg on
  // the LIMIT we quote it against, so a stale limit silently underfunds the
  // permit. These are the gas the executor BILLED on Sepolia fills on
  // 2026-10-06 — 1_154_652 for a reveal with no resolver deploy and 2_164_879
  // with one (0xc03cb436…), 384_879 for a repeat commit and 663_019 for a
  // first one — and moving them has to be a deliberate edit here too.
  it('pins the leg limits to the measured fills', () => {
    expect(HCA_LEG_GAS_LIMITS.commit).toBe(450_000n)
    expect(HCA_ACCOUNT_DEPLOY_GAS).toBe(300_000n)
    expect(HCA_LEG_GAS_LIMITS.register).toBe(1_250_000n)
    expect(HCA_RESOLVER_DEPLOY_GAS).toBe(1_070_000n)

    expect(commitLegGasLimit({ isHcaDeployed: true })).toBeGreaterThan(384_879n)
    expect(commitLegGasLimit({ isHcaDeployed: false })).toBeGreaterThan(
      663_019n,
    )
    expect(registerLegGasLimit({ isResolverDeployed: true })).toBeGreaterThan(
      1_154_652n,
    )
    expect(registerLegGasLimit({ isResolverDeployed: false })).toBeGreaterThan(
      2_164_879n,
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
          market: unflooredMarket(),
        }),
      })

    const fresh = await budgetFor(false)
    const existing = await budgetFor(true)

    // 1.07M gas × 5 gwei × $1000/ETH ÷ $1/USDC = 5.35 USDC. The deploy is what
    // separates a ~1.15M-gas reveal fill from a 2.16M one, so pricing it at
    // the old 210k left a first registration underfunded by most of it.
    expect(fresh.registerCost - existing.registerCost).toBe(5_350_000n)
    expect(fresh.total).toBeGreaterThan(existing.total)
  })
})

describe('commitLegGasLimit', () => {
  it('funds the HCA deploy only on a first commit', () => {
    expect(commitLegGasLimit({ isHcaDeployed: true })).toBe(
      HCA_LEG_GAS_LIMITS.commit,
    )
    expect(commitLegGasLimit({ isHcaDeployed: false })).toBe(
      HCA_LEG_GAS_LIMITS.commit + HCA_ACCOUNT_DEPLOY_GAS,
    )
  })

  it('prices the HCA deploy into the quote the commit leg is funded from', () => {
    // The budget cannot show this on a chain with a gas-price floor: the floor
    // is worth 1.8 x 1.55M gas, which outweighs a 750k commit leg at any gas
    // price the fallback model allows. The limit is what the rail prices the
    // quote on, so that is where the allowance has to be right.
    expect(
      commitLegGasLimit({ isHcaDeployed: false }) -
        commitLegGasLimit({ isHcaDeployed: true }),
    ).toBe(HCA_ACCOUNT_DEPLOY_GAS)
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

describe('the per-chain gas-price floor', () => {
  // 1.8 x 1.55M x 2 gwei = 0.00558 ETH, which at $3000/ETH is 16.74 USDC, over
  // the 15 USDC per-leg cap. Measured on Sepolia: a reveal whose refund the
  // orchestrator quoted at 7.14 USDC was funded from a quote of 0.004868 for
  // BOTH legs, because the quote was taken while the base fee was ~19 wei.
  const quoteAt = (spendUsdc: bigint, gasPriceWei: bigint) => async () => ({
    spendUsdc,
    market: market(gasPriceWei),
  })

  it('funds a leg the orchestrator priced at almost nothing', async () => {
    const breakdown = await estimateHcaBudget({
      ...baseParams(USDC(5)),
      quoteLegCostUsdc: quoteAt(2_434n, 19n),
    })

    expect(breakdown.commitCost).toBe(15_000_000n)
    expect(breakdown.registerCost).toBe(15_000_000n)
    expect(breakdown.source).toBe('quote')
  })

  it('leaves a leg priced above the floor alone', async () => {
    const breakdown = await estimateHcaBudget({
      ...baseParams(USDC(5)),
      quoteLegCostUsdc: quoteAt(20_000_000n, 5_000_000_000n),
    })

    expect(breakdown.commitCost).toBe(20_000_000n)
  })

  it('does not floor without market data to price it from', async () => {
    const breakdown = await estimateHcaBudget({
      ...baseParams(USDC(5)),
      quoteLegCostUsdc: async () => ({ spendUsdc: 2_434n }),
    })

    expect(breakdown.commitCost).toBe(2_434n)
  })

  it('keeps two floored legs inside the budget ceiling', async () => {
    const breakdown = await estimateHcaBudget({
      ...baseParams(USDC(5)),
      quoteLegCostUsdc: quoteAt(2_434n, 19n),
    })

    expect(breakdown.commitCost + breakdown.registerCost).toBeLessThan(
      HCA_MAX_LEG_FEES_USDC,
    )
  })
})

describe('legFeeUsdc', () => {
  const REFUND_TOKEN = getDestinationContracts(sepolia.id).usdc

  /**
   * The refund signed into Sepolia commit `0xc42423ad…` (2026-10-07, ~1 Mwei
   * gas): its overhead is almost all relay fee. That commit pulled 10_017
   * units, while the quoted spends for both legs came to 7_681.
   */
  const cheapGasRefund: QuotedGasRefund = {
    token: REFUND_TOKEN,
    exchangeRate: 2_560_716_071n,
    refundAmount: 21_717n,
    gasOverhead: 2_597_034n,
  }

  it('covers the relay fee the quoted spend leaves out', () => {
    const fee = legFeeUsdc({
      spendUsdc: 3_765n,
      gasLimit: HCA_LEG_GAS_LIMITS.commit,
      gasPriceWei: 1_100_031n,
      gasRefund: cheapGasRefund,
    })
    // (450k + 2 × 2,597,034) gas × 1.1 Mwei × the exchange rate, rounded up.
    expect(fee).toBe(15_899n)
    expect(fee).toBeGreaterThan(10_017n)
  })

  it('never budgets above the signed refund ceiling', () => {
    expect(
      legFeeUsdc({
        spendUsdc: 3_765n,
        gasLimit: HCA_LEG_GAS_LIMITS.commit,
        gasPriceWei: 1_100_031n,
        gasRefund: { ...cheapGasRefund, refundAmount: 12_000n },
      }),
    ).toBe(12_000n)
  })

  // At ~1 gwei the overhead is ~52k gas, so the bound comes to ~3.65 USDC on
  // the register leg: a quote above that must not be grown.
  it('keeps the quoted spend when it is the larger figure', () => {
    expect(
      legFeeUsdc({
        spendUsdc: 4_000_000n,
        gasLimit: HCA_LEG_GAS_LIMITS.register,
        gasPriceWei: 1_000_000_000n,
        gasRefund: {
          token: REFUND_TOKEN,
          exchangeRate: 2_697_889_577n,
          refundAmount: 9_029_670n,
          gasOverhead: 52_321n,
        },
      }),
    ).toBe(4_000_000n)
  })

  it('falls back to the quoted spend without a refund or a gas price', () => {
    expect(legFeeUsdc({ spendUsdc: 3_765n, gasLimit: 450_000n })).toBe(3_765n)
    expect(
      legFeeUsdc({
        spendUsdc: 3_765n,
        gasLimit: 450_000n,
        gasRefund: cheapGasRefund,
      }),
    ).toBe(3_765n)
  })

  it('sizes the registration legs from it', async () => {
    const quote = (spendUsdc: bigint): QuoteLegResult => ({
      spendUsdc,
      market: market(1_100_031n),
      gasRefund: cheapGasRefund,
    })

    // A first registration, as in the failed run: the reveal deploys the
    // resolver, so its leg is priced on a larger gas limit than the commit.
    const breakdown = await estimateHcaBudget({
      ...baseParams(8_005_501n),
      isResolverDeployed: false,
      quoteLegCostUsdc: async (leg) =>
        quote(leg === 'commit' ? 3_765n : 3_916n),
    })

    // At this gas price the per-chain floor is the larger of the two bounds,
    // so it is what sizes the legs; `legFeeUsdc` alone would give 15_899.
    expect(breakdown.commitCost).toBeGreaterThanOrEqual(15_899n)
    // Covers the 10_017 the commit pulled plus a reveal of the same shape.
    expect(breakdown.total - 8_005_501n).toBeGreaterThan(2n * 10_017n)
  })
})
