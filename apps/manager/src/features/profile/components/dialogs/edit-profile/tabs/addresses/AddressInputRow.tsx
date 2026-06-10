import { CircleAlert, X } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/lib/utils'
import { AddressIcon } from './AddressIcon'

interface AddressInputRowProps {
  readonly disabled?: boolean
  readonly errorMessage?: string
  readonly label: string
  readonly onChange: (value: string) => void
  readonly onRemove?: () => void
  readonly placeholder?: string
  readonly value: string
  readonly coinType: number
}

export const AddressInputRow = ({
  disabled,
  errorMessage,
  label,
  onChange,
  onRemove,
  placeholder = 'Enter wallet address',
  value,
  coinType,
}: AddressInputRowProps) => {
  const inputId = useId()

  return (
    <div className="relative flex items-start gap-3 pt-2">
      <div className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-[30px] left-0 z-10">
        <AddressIcon coinType={coinType} label={label} />
      </div>
      <label
        className="absolute top-0 left-4 z-10 bg-white px-1 text-[14px] text-ens-quartz-400 leading-none"
        htmlFor={inputId}
      >
        {label}
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <input
          aria-invalid={Boolean(errorMessage)}
          aria-label={label}
          className={cn(
            'h-11 w-full min-w-0 rounded-sm border border-[#d4d4d4] bg-transparent px-4 py-3 text-[12px] text-ens-quartz-900 outline-none transition-colors placeholder:text-ens-quartz-400 focus-visible:border-ens-lapis-500 disabled:pointer-events-none disabled:opacity-50',
            errorMessage && 'border-red-600 focus-visible:border-red-600',
          )}
          disabled={disabled}
          id={inputId}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
        {errorMessage ? (
          <p
            className="flex items-center gap-1.5 text-[14px] text-red-700 leading-[1.2]"
            role="alert"
          >
            <CircleAlert
              aria-hidden="true"
              className="size-4.5 shrink-0 text-red-700"
              strokeWidth={2}
            />
            <span>{errorMessage}</span>
          </p>
        ) : null}
      </div>
      {onRemove ? (
        <button
          aria-label={`Remove ${label}`}
          className="mt-2.5 flex size-6 shrink-0 items-center justify-center rounded-sm text-ens-quartz-400 transition-colors hover:bg-ens-quartz-100 hover:text-ens-quartz-700 disabled:pointer-events-none disabled:opacity-50"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
