import { secondsInYear } from 'date-fns/constants'
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

  return (
    <label
      className={cn(
        'group flex w-full cursor-pointer items-center justify-between rounded-lg border border-[#DEDEDF] bg-neutral-50 p-5 transition-all focus-within:border-ens-blue hover:border-ens-blue aria-pressed:border-ens-blue',
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
