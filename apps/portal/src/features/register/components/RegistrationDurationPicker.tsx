import { Minus, Plus } from 'lucide-react'
import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type RegistrationDurationPickerProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  className?: string
}

export const RegistrationDurationPicker = ({
  value,
  onChange,
  min = 1,
  max = 9007199254740990,
  className,
}: RegistrationDurationPickerProps) => {
  const [isFocused, setIsFocused] = useState(false)

  const handleDecrement = useCallback(() => {
    if (value > min) {
      onChange(value - 1)
    }
  }, [value, min, onChange])

  const handleIncrement = useCallback(() => {
    if (value < max) {
      onChange(value + 1)
    }
  }, [value, max, onChange])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseInt(e.target.value, 10)
      if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) {
        onChange(parsed)
      }
    },
    [min, max, onChange],
  )

  const label = value === 1 ? '1 year' : `${value} years`

  return (
    <div
      className={cn(
        'flex items-center gap-0 rounded-md border border-input bg-background px-2 h-13',
        'overflow-hidden',
        className,
      )}
    >
      <Button
        type="button"
        size="icon"
        variant="secondary"
        onClick={handleDecrement}
        disabled={value <= min}
        className="size-10 shrink-0 bg-gray-200"
      >
        <Minus className="size-4" strokeWidth={2} />
      </Button>

      <div className="relative flex min-w-0 flex-1 items-center justify-center px-2 py-1">
        <Input
          type="number"
          min={min}
          max={max}
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          aria-label={label}
          className={cn(
            'h-8 w-full min-w-0 border-0 bg-transparent p-0 text-center',
            'shadow-none focus-visible:ring-0 [appearance:textfield]',
            '[&::-webkit-inner-spin-button]:appearance-none',
            '[&::-webkit-outer-spin-button]:appearance-none',
            'text-2xl md:text-2xl',
            isFocused && 'font-medium',
          )}
        />
        <span
          className={cn(
            'pointer-events-none absolute inset-0',
            'text-2xl font-medium',
            'flex items-center justify-center bg-background',
            isFocused && 'hidden',
          )}
        >
          {label}
        </span>
      </div>

      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={handleIncrement}
        disabled={value >= max}
        className="size-10 shrink-0 bg-gray-200"
      >
        <Plus className="size-4" strokeWidth={2} />
      </Button>
    </div>
  )
}
