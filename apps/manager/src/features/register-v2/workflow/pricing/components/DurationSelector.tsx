import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { msg } from '@lingui/core/macro'
import { useQueries } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { secondsInDay } from 'date-fns/constants'
import { SECONDS_IN_YEAR } from '@/features/register-v2/utils/time'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import {
  type GetRegisterPriceError,
  getRegisterPriceQueryOptions,
  type MissingTokenError,
} from '../../../data/queries/pricing.query'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { DurationCustomRow } from './DurationCustomRow'
import { type DurationPresetData, DurationPresetRow } from './DurationPresetRow'

export const PRESET_DURATIONS: DurationPresetData[] = [
  {
    duration: SECONDS_IN_YEAR,
    title: msg`Starter`,
    subtitle: msg`Try it out`,
    kind: 'default',
    color: 'citrine',
  },
  {
    duration: SECONDS_IN_YEAR * 3,
    title: msg`Committed`,
    subtitle: msg`Make it yours`,
    kind: 'mostPopular',
    color: 'peridot',
  },
  {
    duration: SECONDS_IN_YEAR * 6,
    title: msg`Long-term identity`,
    subtitle: msg`Best yearly price`,
    kind: 'default',
    color: 'garnet',
  },
]

type PresetPricingQuery = {
  isPending: boolean
  error: GetRegisterPriceError | MissingTokenError | null
  data?: {
    totalPrice: number
    basePrice: number
  }
}

export const DurationSelector = () => {
  const { uiActor, label } = useRegistrationV2Context()
  const selectedDuration = useSelector(
    uiActor,
    (state) => state.context.duration,
  )

  const presetPricingQueries = useQueries({
    queries: PRESET_DURATIONS.map(({ duration }) =>
      getRegisterPriceQueryOptions(label, duration, TOKENS.USDC.symbol),
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
                  result.data.basePrice + result.data.premium,
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
    ({ duration }) => Math.abs(selectedDuration - duration) < secondsInDay,
  )

  return (
    <div className="flex h-full flex-col justify-between gap-3 rounded-xl border-[#DDDDDE] border-[0.5px] bg-white p-3 shadow-temp-card">
      {PRESET_DURATIONS.map((data, idx) => {
        const query = presetPricingQueries[idx]
        if (!query) {
          throw new Error('Invalid preset duration index')
        }

        return (
          <DurationPresetRow
            basePrice={query.data?.basePrice}
            data={data}
            isLoading={query.isPending}
            isSelected={idx === selectedPresetIdx}
            key={data.duration}
            onSelect={() =>
              uiActor.send({
                type: 'pricing.duration.set',
                duration: data.duration,
              })
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
        type="register"
      />
    </div>
  )
}
