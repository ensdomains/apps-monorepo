import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { useMemo, useRef } from 'react'
import { zeroAddress } from 'viem'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { getOracleParamsQueryOptions } from '@/features/register-v2/data/queries/oracleParams.query'
import { getPricingQueryOptions } from '@/features/register-v2/data/queries/pricing.query'
import { useRegistrationV2Context } from '@/features/register-v2/state/registrationUi.context'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import {
  type BuildPriceCooldownBannerResult,
  buildPriceCooldownBannerProps,
} from '../../lib/buildPriceCooldownBannerProps'
import {
  getPremiumPriceAtInstant,
  type PremiumInstantRange,
} from '../../lib/premiumDecay'
import {
  PREMIUM_DURATION_MS,
  PREMIUM_RESOLUTION,
} from '../temporary-premium/TemporaryPremiumChart'
import { PriceCooldownBanner } from './PriceCooldownBanner'
import { usePriceCooldownChartSelection } from './usePriceCooldownChartSelection'
import { mockNow } from '../../../../data/mocks/mockClock'
import { useTickingNowMs } from './useTickingNowMs'

type PriceCooldownBannerLoadedProps = {
  bannerData: BuildPriceCooldownBannerResult
  premiumStartDate: Date
  premiumRange: PremiumInstantRange
  nowPoint: number
  /** Live USD value of the current premium, recomputed every second. */
  currentPremiumValue?: number
}

const PriceCooldownBannerLoaded = ({
  bannerData,
  premiumStartDate,
  nowPoint,
  currentPremiumValue,
}: PriceCooldownBannerLoadedProps) => {
  const {
    selectedPoint,
    targetPriceInput,
    handleSelectedPointChange,
    handleTargetPriceInputChange,
    handleTargetPriceInputBlur,
    targetPriceReachLabel,
  } = usePriceCooldownChartSelection(premiumStartDate, nowPoint)

  return (
    <PriceCooldownBanner
      {...bannerData.props}
      currentPremiumValue={currentPremiumValue}
      nowPoint={nowPoint}
      onSelectedPointChange={handleSelectedPointChange}
      onTargetPriceInputBlur={handleTargetPriceInputBlur}
      onTargetPriceInputChange={handleTargetPriceInputChange}
      premiumStartDate={premiumStartDate}
      selectedPoint={selectedPoint}
      targetPriceInput={targetPriceInput}
      targetPriceReachLabel={targetPriceReachLabel}
    />
  )
}

export const PriceCooldownBannerSection = () => {
  const { uiActor, label } = useRegistrationV2Context()
  const { ownerAddress } = useSmartAccountContext()
  const baseRate = useBaseRate(label)

  const duration = useSelector(uiActor, (state) => state.context.duration)

  const pricingQuery = useQuery({
    ...getPricingQueryOptions(
      label,
      ownerAddress ?? zeroAddress,
      duration,
      TOKENS.USDC.symbol,
    ),
    select: (data) => ({
      premiumUsd: decimalBigintToNumber(data.premium, TOKENS.USDC.decimals),
    }),
    placeholderData: keepPreviousData,
  })

  const oracleQuery = useQuery(getOracleParamsQueryOptions)

  const bannerData = useMemo(() => {
    const premiumDecay = oracleQuery.data?.premiumDecay
    if (!premiumDecay || pricingQuery.data === undefined) return null

    return buildPriceCooldownBannerProps({
      premiumUsd: pricingQuery.data.premiumUsd,
      baseRatePerSecond: baseRate,
      premiumDecay,
    })
  }, [oracleQuery.data?.premiumDecay, pricingQuery.data, baseRate])

  // Anchor the premium start date to the FIRST non-null derivation.
  //
  // `getPremiumInstantRange` back-solves startMs from (currentPremium, Date.now()).
  // Without anchoring, every 60s pricing refetch would shift startMs by the
  // network latency between fetches, making the chart's x-axis crawl. We want
  // the chart anchored once and the dot to do the moving.
  //
  // The anchor is implicitly keyed by name+duration: changing either makes
  // pricingQuery key change → component unmounts/remounts → ref resets. Good.
  const premiumStartDateRef = useRef<Date | null>(null)
  const premiumRange = bannerData?.premiumRange
  if (premiumRange && !premiumStartDateRef.current) {
    premiumStartDateRef.current = new Date(premiumRange.startMs)
  }
  const premiumStartDate = premiumStartDateRef.current

  // Tick locally every second so the chart's "now" dot crawls smoothly between
  // on-chain refetches. Disabled when the banner isn't showing to avoid a
  // background interval. Each refetch corrects any drift (the contract is the
  // source of truth for the cart total — see pricing.query.ts).
  //
  // We pass `mockNow` (shared with buildMockedPricing). In production it's
  // identical to Date.now(); under VITE_FF_MOCK_TEMP_PREMIUM_TIME_SCALE the
  // banner pill, chart dot, AND mocked cart total all advance in lockstep
  // on the same virtual clock — otherwise the pill would race ahead of the
  // cart, which is the symptom we just hit.
  const tickEnabled = !!premiumStartDate
  const nowMs = useTickingNowMs(1_000, tickEnabled, mockNow)

  // NOTE: we compute the float version of `pointAtDate` here. The exported
  // pointAtDate rounds to an integer, which over a 1-second tick means
  // nowPoint flips by 1 only every ~28s (1s / 21 days × 65536 ≈ 0.036/s).
  // That made the chart's `now` dot appear frozen — same integer in,
  // same memoized value out, no chart re-render. The chart's downstream
  // math (`priceAtDay`, `posAtPoint`) is fully continuous, so passing a
  // fractional point is fine and gives smooth per-second motion.
  const nowPoint = useMemo(() => {
    if (!premiumStartDate) return 0
    const elapsedMs = nowMs - premiumStartDate.getTime()
    return (elapsedMs / PREMIUM_DURATION_MS) * PREMIUM_RESOLUTION
  }, [premiumStartDate, nowMs])

  // Live, per-second premium USD value for the "Additional fee" / "Fee at
  // this moment" pill. Derived from the anchored start date, the local 1s
  // tick, and the on-chain decay config. The pill renders this via
  // AnimateNumber (slot-machine digit animation). The contract refetch every
  // 60s remains authoritative for the cart total in PaymentCard.
  const liveCurrentPremiumUsd = useMemo(() => {
    const decay = oracleQuery.data?.premiumDecay
    if (!premiumStartDate || !decay) return undefined
    return getPremiumPriceAtInstant(
      premiumStartDate.getTime(),
      nowMs,
      decay,
    )
  }, [premiumStartDate, nowMs, oracleQuery.data?.premiumDecay])

  // Also override the static fallback label so it matches the animated value
  // on first paint (before AnimateNumber settles) and during SSR / when the
  // animated path is unavailable for any reason.
  const liveCurrentPremiumLabel =
    liveCurrentPremiumUsd !== undefined
      ? formatUsd(liveCurrentPremiumUsd)
      : null

  if (!bannerData?.show || !premiumStartDate || !premiumRange) {
    return null
  }

  const livePropsBannerData: BuildPriceCooldownBannerResult =
    liveCurrentPremiumLabel
      ? {
          ...bannerData,
          props: {
            ...bannerData.props,
            currentPremiumLabel: liveCurrentPremiumLabel,
          },
        }
      : bannerData

  return (
    <PriceCooldownBannerLoaded
      bannerData={livePropsBannerData}
      currentPremiumValue={liveCurrentPremiumUsd}
      nowPoint={nowPoint}
      premiumRange={premiumRange}
      premiumStartDate={premiumStartDate}
    />
  )
}
