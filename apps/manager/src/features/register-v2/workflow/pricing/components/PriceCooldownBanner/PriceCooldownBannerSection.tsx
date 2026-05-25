import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { useEffect, useMemo, useState } from 'react'
import { zeroAddress } from 'viem'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { getOracleParamsQueryOptions } from '@/features/register-v2/data/queries/oracleParams.query'
import { getPricingQueryOptions } from '@/features/register-v2/data/queries/pricing.query'
import { useRegistrationV2Context } from '@/features/register-v2/state/registrationUi.context'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { buildPriceCooldownBannerProps } from '../../lib/buildPriceCooldownBannerProps'
import { formatPremiumDateTimeLocal } from '../../lib/formatPremiumDateTime'
import { formatPriceForInput } from '../../lib/formatPriceForInput'
import { getInstantMsForPremiumPrice } from '../../lib/premiumDecay'
import { PriceCooldownBanner } from './PriceCooldownBanner'

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

  const [targetPriceInput, setTargetPriceInput] = useState('')

  const targetPriceReachLabel = useMemo(() => {
    if (!bannerData?.premiumRange || !oracleQuery.data?.premiumDecay) {
      return null
    }

    const parsed = Number.parseFloat(targetPriceInput.replace(/,/g, ''))
    if (!Number.isFinite(parsed) || parsed <= 0) return null

    const reachMs = getInstantMsForPremiumPrice(
      bannerData.premiumRange.startMs,
      parsed,
      oracleQuery.data.premiumDecay,
    )

    return (
      <>
        The fee will reach {formatUsd(parsed)} on{' '}
        <span className="text-[#353535]">
          {formatPremiumDateTimeLocal(reachMs)}.
        </span>
      </>
    )
  }, [
    bannerData?.premiumRange,
    oracleQuery.data?.premiumDecay,
    targetPriceInput,
  ])

  useEffect(() => {
    const current = pricingQuery.data?.premiumUsd
    if (!bannerData?.show || !current || current <= 0) return
    setTargetPriceInput((prev) => (prev ? prev : formatPriceForInput(current)))
  }, [bannerData?.show, pricingQuery.data?.premiumUsd])

  if (!bannerData?.show) {
    return null
  }

  return (
    <PriceCooldownBanner
      {...bannerData.props}
      onTargetPriceInputChange={setTargetPriceInput}
      targetPriceInput={targetPriceInput}
      targetPriceReachLabel={targetPriceReachLabel}
    />
  )
}
