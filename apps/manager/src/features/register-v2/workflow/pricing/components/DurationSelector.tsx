import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useQueries } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { secondsInDay, secondsInYear } from 'date-fns/constants'
import { zeroAddress } from 'viem'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { calculateDiscount } from '@/features/register-v2/utils/discount'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import {
  type GetPricingError,
  getPricingQueryOptions,
  type MissingTokenError,
} from '../../../data/queries/pricing.query'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { DurationCustomRow } from './DurationCustomRow'
import { DurationPresetRow } from './DurationPresetRow'

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
  const { uiActor, label } = useRegistrationV2Context()
  const account = useSmartAccountContext()
  const selectedDuration = useSelector(
    uiActor,
    (state) => state.context.duration,
  )

  const ownerAddress = account.ownerAddress ?? zeroAddress

  const baseRate = useBaseRate(label)

  const presetPricingQueries = useQueries({
    queries: PRESET_DURATIONS.map((duration) =>
      getPricingQueryOptions(label, ownerAddress, duration, TOKENS.USDC.symbol),
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

        const { discountPercentage } = calculateDiscount(
          query.data?.basePrice ?? 0,
          baseRate,
          BigInt(duration),
        )

        return (
          <DurationPresetRow
            discountPercentage={discountPercentage}
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
