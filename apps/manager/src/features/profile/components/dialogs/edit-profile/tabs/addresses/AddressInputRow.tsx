import { X } from 'lucide-react'
import { useId } from 'react'
import { AddressIcon } from './AddressIcon'

export const AddressInputRow = ({
  disabled,
  label,
  onChange,
  onRemove,
  placeholder = 'Enter wallet address',
  value,
  coinType,
}: {
  readonly disabled?: boolean
  readonly label: string
  readonly onChange: (value: string) => void
  readonly onRemove?: () => void
  readonly placeholder?: string
  readonly value: string
  readonly coinType: number
}) => {
  const inputId = useId()

  return (
    <div className="relative flex items-center gap-3 pt-2">
      <div className="-translate-x-1/2 -translate-y-[calc(50%-4px)] pointer-events-none absolute top-1/2 left-0 z-10">
        <AddressIcon coinType={coinType} label={label} />
      </div>
      <label
        className="absolute top-0 left-4 z-10 bg-white px-1 text-[14px] text-ens-quartz-400 leading-none"
        htmlFor={inputId}
      >
        {label}
      </label>
      <input
        aria-label={label}
        className="h-11 min-w-0 flex-1 rounded-sm border border-[#d4d4d4] bg-transparent px-4 py-3 text-[12px] text-ens-quartz-900 outline-none transition-colors placeholder:text-ens-quartz-400 focus-visible:border-ens-lapis-500 disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        id={inputId}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      {onRemove ? (
        <button
          aria-label={`Remove ${label}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-ens-quartz-400 transition-colors hover:bg-ens-quartz-100 hover:text-ens-quartz-700 disabled:pointer-events-none disabled:opacity-50"
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
