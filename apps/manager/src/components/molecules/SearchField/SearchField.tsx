import { cva } from 'class-variance-authority'
import { Search } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const searchFieldVariants = cva(
  [
    // Layout & sizing
    'h-full w-full self-stretch',
    // Typography
    'font-sans font-semibold text-lg leading-[110%] tracking-[-0.4px]',
    // Spacing
    'pt-[21px] pr-[28px] pb-[21px] pl-[52px]',
    // Borders & colors
    'rounded border-[0.25px] border-brand-grey-2',
    'bg-brand-dust text-brand-blue',
    // Effects
    'shadow-[0_9px_17px_0_rgba(var(--color-lapis-shadow-rgb),0.1)]',
    'transition-all duration-200 ease-in-out',
    // States
    'placeholder:text-lapis-surface',
    'focus:border-transparent focus:outline-none',
    'focus:shadow-[0_9px_17px_0_rgba(var(--color-lapis-shadow-rgb),0.1),0_0_0_2px_oklch(57.2%_0.13_240deg/0.2)]',
  ],
  {
    variants: {
      disabled: {
        true: 'cursor-not-allowed',
      },
    },
  },
)

const searchIconVariants = cva([
  '-translate-y-1/2 absolute top-1/2 left-[18px]',
  'h-[26px] w-[26px]',
  'text-brand-grey',
])

const searchFieldContainerVariants = cva([
  'relative flex items-center gap-[15px]',
])

export interface SearchFieldProps {
  placeholder?: string
  value?: string
  defaultValue?: string
  onSearch?: (value: string) => void
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  className?: string
  disabled?: boolean
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  (
    {
      placeholder = 'Search domains...',
      value,
      defaultValue,
      onSearch,
      onChange,
      onKeyDown,
      className,
      disabled,
    },
    ref,
  ) => {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && onSearch) {
        const target = event.target as HTMLInputElement
        onSearch(target.value)
      }
      onKeyDown?.(event)
    }

    return (
      <div
        className={cn(
          'search-field-container',
          searchFieldContainerVariants(),
          className,
        )}
      >
        <input
          ref={ref}
          type="text"
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={cn(
            'search-field',
            searchFieldVariants({ disabled: !!disabled }),
          )}
        />

        <Search
          aria-hidden
          className={searchIconVariants()}
          strokeWidth={1.5}
        />
      </div>
    )
  },
)

SearchField.displayName = 'SearchField'
