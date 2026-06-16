import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { useMemo, useRef } from 'react'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { getOracleParamsQueryOptions } from '@/features/register-v2/data/queries/oracleParams.query'
import { getRegisterPriceQueryOptions } from '@/features/register-v2/data/queries/pricing.query'
import { useRegistrationV2Context } from '@/features/register-v2/state/registrationUi.context'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { buildPriceCooldownBannerProps } from '../../lib/buildPriceCooldownBannerProps'
import { getPremiumPriceAtInstant } from '../../lib/premiumDecay'
import {
  PREMIUM_DURATION_MS,
  PREMIUM_RESOLUTION,
} from '../temporary-premium/TemporaryPremiumChart'
import { PriceCooldownBanner } from './PriceCooldownBanner'
import { useTickingNowMs } from './useTickingNowMs'

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

  return (
    <PriceCooldownBanner
      cooldown={{
        ...bannerData.props.cooldown,
        premiumStartDate,
        nowPoint,
      }}
      fees={{
        ...bannerData.props.fees,
        ...(liveCurrentPremiumLabel
          ? { currentPremiumLabel: liveCurrentPremiumLabel }
          : null),
        currentPremiumValue: liveCurrentPremiumUsd,
      }}
    />
  )
}
