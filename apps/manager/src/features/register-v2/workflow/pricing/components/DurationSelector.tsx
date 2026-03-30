import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useQueries } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { secondsInDay, secondsInYear } from 'date-fns/constants'
import { zeroAddress } from 'viem'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import {
  type GetPricingError,
  getPricingQueryOptions,
  type MissingTokenError,
} from '../../../data/queries/pricing.query'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { getDurationDiscount } from '../lib/durationDiscount'
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
  data?: number
}

export const DurationSelector = () => {
  const { uiActor, label } = useRegistrationV2Context()
  const account = useSmartAccountContext()
  const selectedDuration = useSelector(
    uiActor,
    (state) => state.context.duration,
  )

  const ownerAddress = account.ownerAddress ?? zeroAddress

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
            ? decimalBigintToNumber(
                result.data.totalPrice,
                TOKENS.USDC.decimals,
              )
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
          query.data,
          baseCostQuery?.data,
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
            price={query.data}
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
