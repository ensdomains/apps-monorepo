import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface FilterChipDef<T extends string> {
  readonly value: T
  readonly label: ReactNode
  readonly count?: number
  readonly disabled?: boolean
}

interface FilterChipsProps<T extends string> {
  readonly value: T
  readonly chips: readonly FilterChipDef<T>[]
  readonly onChange: (value: T) => void
}

export const FilterChips = <T extends string>({
  value,
  chips,
  onChange,
}: FilterChipsProps<T>) => (
  <div className="flex flex-wrap items-center gap-2">
    {chips.map((chip) => {
      const isActive = chip.value === value

      return (
        <button
          aria-pressed={isActive}
          className={cn(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] px-2.5',
            'font-sans text-[14px] uppercase tracking-[0.28px]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            isActive
              ? 'bg-[#d9d9d9] text-ens-quartz-900'
              : 'bg-[#f4f4f4] text-ens-quartz-400 hover:bg-ens-quartz-100',
          )}
          disabled={chip.disabled}
          key={chip.value}
          onClick={() => onChange(chip.value)}
          type="button"
        >
          <span>{chip.label}</span>
          {chip.count !== undefined && chip.count > 0 && (
            <span
              className={cn(
                'inline-flex items-center justify-center rounded-[4px] px-1.5 py-0.5',
                'font-sans text-[11.5px] leading-none',
                isActive
                  ? 'bg-white text-ens-quartz-500'
                  : 'bg-[#eae8e8] text-ens-quartz-400',
              )}
            >
              {chip.count}
            </span>
          )}
        </button>
      )
    })}
  </div>
)
