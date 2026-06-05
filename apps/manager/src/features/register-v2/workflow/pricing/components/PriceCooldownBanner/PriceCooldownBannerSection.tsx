import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { useEffect, useMemo, useRef } from 'react'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { getOracleParamsQueryOptions } from '@/features/register-v2/data/queries/oracleParams.query'
import { getRegisterPriceQueryOptions } from '@/features/register-v2/data/queries/pricing.query'
import { useRegistrationV2Context } from '@/features/register-v2/state/registrationUi.context'
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
  PREMIUM_DAYS,
  PREMIUM_DURATION_MS,
  PREMIUM_RESOLUTION,
  PREMIUM_START_PRICE,
} from '../temporary-premium/TemporaryPremiumChart'
import { PriceCooldownBanner } from './PriceCooldownBanner'
import { usePriceCooldownChartSelection } from './usePriceCooldownChartSelection'
import { useTickingNowMs } from './useTickingNowMs'

type PriceCooldownBannerLoadedProps = {
  bannerData: BuildPriceCooldownBannerResult
  premiumStartDate: Date
  premiumRange: PremiumInstantRange
  nowPoint: number
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
  const baseRate = useBaseRate(label)

  const duration = useSelector(uiActor, (state) => state.context.duration)

  const pricingQuery = useQuery({
    ...getRegisterPriceQueryOptions(label, duration, TOKENS.USDC.symbol),
    select: (data) => ({
      premiumUsd: decimalBigintToNumber(data.premium, TOKENS.USDC.decimals),
    }),
    placeholderData: keepPreviousData,
  })

  const oracleQuery = useQuery(getOracleParamsQueryOptions)

  // Dev-only safeguard: the decay CHART (TemporaryPremiumChart) draws its curve
  // from hardcoded v1 constants, while the banner/fee use the on-chain oracle
  // params. They match on the current Sepolia deployment, but if the oracle
  // ever drifts the chart would silently render a curve that disagrees with the
  // banner. Warn loudly so it's caught. Full fix = parameterize the chart from
  // the oracle (tracked follow-up).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const decay = oracleQuery.data?.premiumDecay
    if (!decay) return
    const chartConfig = {
      startPriceUsd: PREMIUM_START_PRICE,
      periodMs: PREMIUM_DURATION_MS,
      halvingPeriodMs: PREMIUM_DURATION_MS / PREMIUM_DAYS,
    }
    if (
      decay.startPriceUsd !== chartConfig.startPriceUsd ||
      decay.periodMs !== chartConfig.periodMs ||
      decay.halvingPeriodMs !== chartConfig.halvingPeriodMs
    ) {
      console.warn(
        '[temp-premium] On-chain oracle params differ from the chart’s hardcoded ' +
          'curve constants — the decay chart may not match the banner/fee. ' +
          'Parameterize the chart from the oracle (see follow-up ticket).',
        { oracle: decay, chart: chartConfig },
      )
    }
  }, [oracleQuery.data?.premiumDecay])

  const bannerData = useMemo(() => {
    const premiumDecay = oracleQuery.data?.premiumDecay
    if (!premiumDecay || pricingQuery.data === undefined) return null

    return buildPriceCooldownBannerProps({
      premiumUsd: pricingQuery.data.premiumUsd,
      baseRatePerSecond: baseRate,
      premiumDecay,
    })
  }, [oracleQuery.data?.premiumDecay, pricingQuery.data, baseRate])

  // Anchor the back-solved start date once per (label, duration), and only from
  // fresh (non-placeholder) data. `getPremiumInstantRange` back-solves startMs
  // from (currentPremium, Date.now()), so re-deriving on every 60s refetch
  // would crawl the chart's x-axis. Keying by label+duration (and ignoring the
  // `keepPreviousData` snapshot) stops a newly selected name from reusing the
  // previous name's cooldown window.
  const anchorKey = `${label}:${duration}`
  const anchorKeyRef = useRef<string | null>(null)
  const premiumStartDateRef = useRef<Date | null>(null)
  const premiumRange = bannerData?.premiumRange
  if (
    premiumRange &&
    !pricingQuery.isPlaceholderData &&
    anchorKeyRef.current !== anchorKey
  ) {
    premiumStartDateRef.current = new Date(premiumRange.startMs)
    anchorKeyRef.current = anchorKey
  }
  // Only expose the anchor when it belongs to the current name+duration; during
  // navigation (placeholder data for a new label) render nothing rather than
  // stale timing.
  const premiumStartDate =
    anchorKeyRef.current === anchorKey ? premiumStartDateRef.current : null

  const tickEnabled = !!premiumStartDate
  const nowMs = useTickingNowMs(1_000, tickEnabled)

  // Inline float version of `pointAtDate`. The exported helper rounds to an
  // integer point — over a 1-second tick that's a no-op for ~28 seconds and
  // the chart appears frozen. The chart's downstream math is continuous so
  // the fractional point is safe.
  const nowPoint = useMemo(() => {
    if (!premiumStartDate) return 0
    const elapsedMs = nowMs - premiumStartDate.getTime()
    return (elapsedMs / PREMIUM_DURATION_MS) * PREMIUM_RESOLUTION
  }, [premiumStartDate, nowMs])

  // Live per-second premium for the banner pill. The cart total still uses
  // the 60s refetch snapshot (authoritative for submission); this is the
  // animation layer between refetches.
  const liveCurrentPremiumUsd = useMemo(() => {
    const decay = oracleQuery.data?.premiumDecay
    if (!premiumStartDate || !decay) return undefined
    return getPremiumPriceAtInstant(premiumStartDate.getTime(), nowMs, decay)
  }, [premiumStartDate, nowMs, oracleQuery.data?.premiumDecay])

  const liveCurrentPremiumLabel =
    liveCurrentPremiumUsd === undefined
      ? null
      : formatUsd(liveCurrentPremiumUsd)

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
