import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { useMemo } from 'react'
import { zeroAddress } from 'viem'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { getOracleParamsQueryOptions } from '@/features/register-v2/data/queries/oracleParams.query'
import { getPricingQueryOptions } from '@/features/register-v2/data/queries/pricing.query'
import { useRegistrationV2Context } from '@/features/register-v2/state/registrationUi.context'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import {
  type BuildPriceCooldownBannerResult,
  buildPriceCooldownBannerProps,
} from '../../lib/buildPriceCooldownBannerProps'
import type { PremiumInstantRange } from '../../lib/premiumDecay'
import { pointAtDate } from '../temporary-premium/TemporaryPremiumChart'
import { PriceCooldownBanner } from './PriceCooldownBanner'
import { usePriceCooldownChartSelection } from './usePriceCooldownChartSelection'

type PriceCooldownBannerLoadedProps = {
  bannerData: BuildPriceCooldownBannerResult
  premiumStartDate: Date
  premiumRange: PremiumInstantRange
  nowPoint: number
}

const PriceCooldownBannerLoaded = ({
  bannerData,
  premiumStartDate,
  nowPoint,
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

  const premiumRange = bannerData?.premiumRange
  const premiumStartDate = useMemo(
    () => (premiumRange ? new Date(premiumRange.startMs) : null),
    [premiumRange],
  )

  const nowPoint = useMemo(() => {
    if (!premiumStartDate) return 0
    return pointAtDate(new Date(), premiumStartDate)
  }, [premiumStartDate])

  if (!bannerData?.show || !premiumStartDate || !premiumRange) {
    return null
  }

  return (
    <PriceCooldownBannerLoaded
      bannerData={bannerData}
      nowPoint={nowPoint}
      premiumRange={premiumRange}
      premiumStartDate={premiumStartDate}
    />
  )
}
