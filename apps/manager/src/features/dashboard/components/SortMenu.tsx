import { Trans } from '@lingui/react/macro'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MSymbol } from '@/components/ui/material-symbol'

export interface SortOption<T extends string> {
  readonly value: T
  readonly label: ReactNode
  readonly triggerLabel?: ReactNode
}

interface SortMenuProps<T extends string> {
  readonly value: T
  readonly options: readonly SortOption<T>[]
  readonly onChange: (value: T) => void
}

export const SortMenu = <T extends string>({
  value,
  options,
  onChange,
}: SortMenuProps<T>) => {
  const active = options.find((option) => option.value === value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-8 w-[174px] shrink-0 items-center justify-between rounded-full px-2 font-sans text-[#232222] text-sm leading-[1.05] tracking-[0.28px] outline-none md:text-base md:tracking-[0.32px]"
          type="button"
        >
          <span className="flex items-center gap-1">
            <span className="flex size-6 flex-col items-center justify-center px-[6.15px]">
              <ChevronDown
                className="size-[12.3px] rotate-180 text-ens-quartz-400"
                strokeWidth={2.5}
              />
              <ChevronDown
                className="size-[12.3px] text-ens-quartz-400"
                strokeWidth={2.5}
              />
            </span>
            <span className="leading-[1.05]">
              <Trans>Sort by</Trans> {active?.triggerLabel ?? active?.label}
            </span>
          </span>
          <MSymbol
            className="ms-opsz-24 ms-wght-300 text-2xl text-[#232222] leading-none"
            symbol="keyboard_arrow_down"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[12rem]">
        <DropdownMenuRadioGroup
          onValueChange={(next) => onChange(next as T)}
          value={value}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
