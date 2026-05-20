import { Trans } from '@lingui/react/macro'
import { ChevronDown, ChevronsUpDown } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
          className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-ens-white px-3 font-sans text-[12px] text-foreground tracking-[0.24px] outline-none"
          type="button"
        >
          <ChevronsUpDown className="size-3 text-ens-quartz-400" />
          <span className="text-ens-quartz-400">
            <Trans>Sort by</Trans>
          </span>
          <span className="font-medium">
            {active?.triggerLabel ?? active?.label}
          </span>
          <ChevronDown className="size-4 text-ens-quartz-400" />
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
