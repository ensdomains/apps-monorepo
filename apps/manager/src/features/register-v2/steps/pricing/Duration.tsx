import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useQueries } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { formatDuration } from 'date-fns'
import { secondsInDay, secondsInYear } from 'date-fns/constants'
import { match, P } from 'ts-pattern'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsdCeil } from '@/utils/formatting/formatUsdCeil'
import { useRegistrationV2Context } from '../../machines/RegistrationV2UiContext'
import {
  type GetPricingError,
  getPricingQueryOptions,
} from '../../queries/pricing'
import { secondsToDuration } from '../../utils/time'

// const secondsInYear = 365 * 24 * 60 * 60

const PRESET_DURATIONS: number[] = [
  secondsInYear,
  secondsInYear * 3,
  secondsInYear * 5,
  secondsInYear * 10,
]

const getDiscountBadgeStyle = (discount: number) =>
  match(discount)
    .with(P.number.gte(30), () => 'bg-slate-700')
    .with(P.number.gte(20), () => 'bg-slate-600')
    .with(P.number.gte(15), () => 'bg-slate-500')
    .with(P.number.gt(0), () => 'bg-slate-400')
    .otherwise(() => undefined)

const DurationRow = ({
  duration,
  isSelected,
  price,
  onSelect,
  isLoading,
  discount,
}: {
  duration: number
  isLoading: boolean
  price: number | undefined
  isSelected: boolean
  onSelect: () => void
  discount: number
}) => {
  if (isLoading) {
    return (
      <div className="flex h-[58px] w-full items-center justify-between md:h-[100px]">
        <div className="flex items-center gap-3 md:gap-5">
          <span className="font-normal text-ens-blue-dark text-sm leading-none tracking-tighter md:text-2xl">
            Loading...
          </span>
        </div>
      </div>
    )
  }

  return (
    <button
      aria-pressed={isSelected}
      className={cn(
        'group flex w-full cursor-pointer items-center justify-between rounded-lg border border-[#DEDEDF] bg-neutral-50 px-5 py-8 transition-all hover:border-ens-blue aria-pressed:border-ens-blue',
      )}
      key={duration}
      onClick={onSelect}
      type="button"
    >
      {/* Left: Year label */}
      <div className="flex">
        <span className="font-normal text-ens-blue-dark text-sm leading-none tracking-tighter md:text-2xl">
          {formatDuration(secondsToDuration(duration))}
        </span>
      </div>

      {/* Right: Discount badge + Price */}
      <div className="flex gap-3">
        {discount > 0 && (
          <div
            className={cn(
              getDiscountBadgeStyle(discount),
              'flex items-center justify-center rounded-xs px-1 py-0.5 md:px-1.5 md:py-1',
            )}
          >
            <span className="font-medium text-white text-xs leading-none tracking-tight md:text-base">
              {discount}% off
            </span>
          </div>
        )}

        <div className="flex items-baseline gap-1 md:gap-1.5">
          <span className="font-medium font-mono text-ens-blue-dark text-xl leading-none tracking-tighter md:text-temp-32px">
            {formatUsdCeil(price ?? 0)}
          </span>
          <span className="font-normal text-[#A0A4A6] text-xs leading-none tracking-tight md:text-base">
            total
          </span>
        </div>
      </div>
    </button>
  )
}

const CustomDurationRow = ({
  selectedDuration,
  onDurationSet,
  isSelected,
}: {
  selectedDuration: number
  onDurationSet: (duration: number) => void
  isSelected: boolean
}) => {
  const customValue = selectedDuration / secondsInYear

  return (
    <label
      className={cn(
        'group flex w-full cursor-pointer items-center justify-between rounded-lg border border-[#DEDEDF] bg-neutral-50 p-5 transition-all focus-within:border-ens-blue hover:border-ens-blue aria-pressed:border-ens-blue',
        isSelected && 'border-ens-blue',
        // disabled &&
        //   'cursor-not-allowed opacity-60 hover:border-ens-gray-three',
      )}
      htmlFor="custom-duration-input"
    >
      {/* Left: Label */}
      <div className="whitespace-nowrap font-normal text-ens-blue-dark text-sm leading-none tracking-tighter md:text-2xl">
        Enter custom duration
      </div>

      {/* Right: Input + years in unified container */}
      <div
        className={cn(
          'flex items-center gap-1.5 rounded border bg-white px-2 py-1.5 group-focus-within:border-ens-blue md:gap-2 md:px-3 md:py-2.5',
          isSelected ? 'border-ens-blue' : 'border-ens-gray-three',
          // disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <input
          aria-label="Custom duration in years"
          className={cn(
            'w-10 md:w-12',
            'border-none bg-transparent outline-none',
            'font-medium font-mono text-ens-blue-dark text-sm leading-none tracking-tighter md:text-xl',
            'text-right',
            'disabled:cursor-not-allowed',
            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          )}
          id="custom-duration-input"
          max={1000}
          min={1}
          onChange={(e) =>
            onDurationSet(Number(e.target.value) * secondsInYear)
          }
          step={1}
          type="number"
          value={customValue}
        />
        <span className="font-normal text-ens-gray-three text-xs leading-none tracking-tight md:text-base">
          years
        </span>
      </div>
    </label>
  )
}

type PresetPricingQuery = {
  isPending: boolean
  error: GetPricingError | null
  data?: number
}

export const DurationSelector = () => {
  // const queryClient = useQueryClient()
  const { uiActor, label } = useRegistrationV2Context()
  const selectedDuration = useSelector(
    uiActor,
    (state) => state.context.duration,
  )

  const presetPricingQueries = useQueries({
    queries: PRESET_DURATIONS.map((duration) => {
      return getPricingQueryOptions(label, duration, TOKENS.USDC.symbol)
    }),
    combine: (results) =>
      results.map((result, idx): PresetPricingQuery => {
        const source = PRESET_DURATIONS[idx]
        if (!source) throw new Error('Invalid preset duration index')

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

  const baseCostQuery = presetPricingQueries[0]!

  const selectedPresetIdx = PRESET_DURATIONS.findIndex(
    (duration) => Math.abs(selectedDuration - duration) < secondsInDay,
  )

  return (
    <div className="flex h-full flex-col justify-between gap-1 rounded-xl border border-[#DDDDDE] bg-white p-1">
      {PRESET_DURATIONS.map((duration, idx) => {
        const query = presetPricingQueries[idx]
        if (!query) throw new Error('Invalid preset duration index')

        const years = duration / secondsInYear
        const discount =
          query.data && baseCostQuery.data
            ? Math.round((1 - query.data / (baseCostQuery.data * years)) * 100)
            : 0

        return (
          <DurationRow
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

      {/* Custom Duration Row */}
      <CustomDurationRow
        isSelected={selectedPresetIdx === -1}
        onDurationSet={(duration) =>
          uiActor.send({ type: 'pricing.duration.set', duration })
        }
        selectedDuration={selectedDuration}
      />
    </div>
  )
}
