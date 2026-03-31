import { secondsInYear } from 'date-fns/constants'
import { useState } from 'react'
import { MIN_REGISTER_DURATION_YEARS } from '@/features/register/components/Pricing/utils'
import { parseLocalizedNumber } from '@/features/register-v2/utils/parse-localized-number'
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
  const [inputDraft, setInputDraft] = useState<string | null>(null)
  const customValue = (selectedDuration / secondsInYear).toLocaleString(
    'en-US',
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    },
  )

  return (
    <label
      className={cn(
        'group flex w-full cursor-pointer flex-col justify-between gap-3 rounded-lg md:flex-row md:items-center',
        'border border-[#DEDEDF] bg-neutral-50 p-5 transition-all focus-within:border-ens-blue hover:border-ens-blue aria-pressed:border-ens-blue max-md:px-3',
        isSelected && 'border-ens-blue',
      )}
      htmlFor="custom-duration-input"
    >
      <div className="whitespace-nowrap font-normal text-ens-blue-dark text-sm leading-none tracking-tighter md:text-lg">
        Enter custom duration
      </div>

      <div
        className={cn(
          'flex w-full max-w-1/2 items-center gap-1.5 rounded border bg-white px-2 py-1.5 group-focus-within:border-ens-blue md:gap-2 md:px-3 md:py-2.5',
          'border-ens-gray-three',
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
          onBlur={() => {
            if (inputDraft === null) {
              return
            }

            const parsed = parseLocalizedNumber(inputDraft)
            if (parsed === undefined) {
              setInputDraft(null)
              return
            }

            const clamped = Math.max(
              MIN_REGISTER_DURATION_YEARS,
              Math.min(1000, parsed),
            )

            onDurationSet(clamped * secondsInYear)
            setInputDraft(null)
          }}
          onChange={(e) => {
            const nextDraft = e.target.value
            setInputDraft(nextDraft)

            const parsed = parseLocalizedNumber(nextDraft)
            if (parsed === undefined) {
              return
            }

            const clamped = Math.max(
              MIN_REGISTER_DURATION_YEARS,
              Math.min(1000, parsed),
            )

            onDurationSet(clamped * secondsInYear)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setInputDraft(null)
              return
            }
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            }
          }}
          step={1}
          type="number"
          value={inputDraft ?? customValue}
        />
        <span className="font-normal text-ens-gray-three text-xs leading-none tracking-tight md:text-base">
          years
        </span>
      </div>
    </label>
  )
}
