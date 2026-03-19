import { secondsInYear } from 'date-fns/constants'
import {
  MIN_REGISTER_DURATION_SECONDS,
  MIN_REGISTER_DURATION_YEARS,
} from '@/features/register/components/Pricing/utils'
import { cn } from '@/lib/utils'

export const DurationCustomRow = ({
  selectedDuration,
  onDurationSet,
  isSelected,
}: {
  selectedDuration: number
  onDurationSet: (duration: number) => void
  isSelected: boolean
}) => {
  const customValue = selectedDuration / secondsInYear
  const isDurationValid = selectedDuration >= MIN_REGISTER_DURATION_SECONDS

  return (
    <label
      className={cn(
        'group flex w-full cursor-pointer flex-col justify-between gap-3 rounded-lg md:flex-row md:items-center',
        'border border-[#DEDEDF] bg-neutral-50 p-5 transition-all focus-within:border-ens-blue hover:border-ens-blue aria-pressed:border-ens-blue max-md:px-3',
        isSelected && 'border-ens-blue',
      )}
      htmlFor="custom-duration-input"
    >
      <div className="whitespace-nowrap font-normal text-ens-blue-dark text-sm leading-none tracking-tighter md:text-2xl">
        Enter custom duration
      </div>

      <div
        className={cn(
          'flex items-center gap-1.5 rounded border bg-white px-2 py-1.5 group-focus-within:border-ens-blue md:gap-2 md:px-3 md:py-2.5',
          isSelected ? 'border-ens-blue' : 'border-ens-gray-three',
        )}
      >
        <input
          aria-label="Custom duration in years"
          className={cn(
            'field-sizing-content',
            'border-none bg-transparent outline-none',
            'font-medium font-mono text-ens-blue-dark text-sm leading-none tracking-tighter md:text-xl',
            'text-right',
            'disabled:cursor-not-allowed',
            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          )}
          id="custom-duration-input"
          max={1000}
          min={1}
          onChange={(e) => {
            const duration = Number(e.target.value) * secondsInYear
            if (duration === selectedDuration) return

            onDurationSet(Number(e.target.value) * secondsInYear)
          }}
          step={1}
          type="number"
          value={customValue.toString()}
        />
        <span className="font-normal text-ens-gray-three text-xs leading-none tracking-tight md:text-base">
          years
        </span>
      </div>

      {/* Error message if duration is less than minimum */}
      {isSelected && !isDurationValid && (
        <p className="text-ens-error text-xs">
          Duration must be at least 28 days (
          {MIN_REGISTER_DURATION_YEARS.toFixed(2)} years)
        </p>
      )}
    </label>
  )
}
