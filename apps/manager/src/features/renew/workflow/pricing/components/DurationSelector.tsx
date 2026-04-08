import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useQueries } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { secondsInDay, secondsInYear } from 'date-fns/constants'
import { zeroAddress } from 'viem'
import {
  type GetPricingError,
  getPricingQueryOptions,
  type MissingTokenError,
} from '@/features/register-v2/data/queries/pricing.query'
import { DurationCustomRow } from '@/features/register-v2/workflow/pricing/components/DurationCustomRow'
import { DurationPresetRow } from '@/features/register-v2/workflow/pricing/components/DurationPresetRow'
import { getDurationDiscount } from '@/features/register-v2/workflow/pricing/lib/durationDiscount'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

const PRESET_DURATIONS: number[] = [
  secondsInYear,
  secondsInYear * 3,
  secondsInYear * 5,
  secondsInYear * 10,
]

type PresetPricingQuery = {
  isPending: boolean
  error: GetPricingError | MissingTokenError | null
  data?: {
    totalPrice: number
    basePrice: number
  }
}

export const DurationSelector = () => {
  const { uiActor, label } = useRenewalUiContext()
  const selectedDuration = useSelector(
    uiActor,
    (state) => state.context.duration,
  )

  const presetPricingQueries = useQueries({
    queries: PRESET_DURATIONS.map((duration) =>
      getPricingQueryOptions(
        label,
        // Zero address used to ignore temporary premium since it's not applicable for renewal
        zeroAddress,
        duration,
        TOKENS.USDC.symbol,
      ),
    ),
    combine: (results) =>
      results.map((result, idx): PresetPricingQuery => {
        const source = PRESET_DURATIONS[idx]
        if (!source) {
          throw new Error('Invalid preset duration index')
        }

        return {
          isPending: result.isPending,
          error: result.error,
          data: result.data
            ? {
                totalPrice: decimalBigintToNumber(
                  result.data.totalPrice,
                  TOKENS.USDC.decimals,
                ),
                basePrice: decimalBigintToNumber(
                  result.data.basePrice,
                  TOKENS.USDC.decimals,
                ),
              }
            : undefined,
        }
      }),
  })

  const baseCostQuery = presetPricingQueries[0]

  const selectedPresetIdx = PRESET_DURATIONS.findIndex(
    (duration) => Math.abs(selectedDuration - duration) < secondsInDay,
  )

  return (
    <div className="flex h-full flex-col justify-between gap-1 rounded-xl border border-[#DDDDDE] bg-white p-1">
      {PRESET_DURATIONS.map((duration, idx) => {
        const query = presetPricingQueries[idx]
        if (!query) {
          throw new Error('Invalid preset duration index')
        }

        const years = duration / secondsInYear
        const discount = getDurationDiscount(
          query.data?.basePrice,
          baseCostQuery?.data?.basePrice,
          years,
        )

        return (
          <DurationPresetRow
            discount={discount}
            duration={duration}
            isLoading={query.isPending}
            isSelected={idx === selectedPresetIdx}
            key={duration}
            onSelect={() =>
              uiActor.send({ type: 'pricing.duration.set', duration })
            }
            price={query.data?.totalPrice}
          />
        )
      })}

      <DurationCustomRow
        isSelected={selectedPresetIdx === -1}
        onDurationSet={(duration) =>
          uiActor.send({ type: 'pricing.duration.set', duration })
        }
        selectedDuration={selectedDuration}
      />
    </div>
  )
}
