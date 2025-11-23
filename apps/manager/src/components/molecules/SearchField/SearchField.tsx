import { Search } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

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
          'relative flex items-center gap-[15px]',
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
          maxLength={255}
          className={cn(
            'h-full w-full self-stretch',
            'font-sans font-semibold text-lg leading-[110%] tracking-[-0.4px]',
            'pt-[21px] pr-[28px] pb-[21px] pl-[52px]',
            'rounded border-[0.25px] border-ens-gray-two',
            'bg-ens-lapis-dust text-ens-blue',
            'shadow-md',
            'transition-all duration-200 ease-in-out',
            'placeholder:text-ens-lapis-surface',
            'focus:border-transparent focus:outline-none',
            'focus:ring-2 focus:ring-blue-500/20',
            'disabled:cursor-not-allowed',
          )}
        />

        <Search
          aria-hidden
          className="-translate-y-1/2 absolute top-1/2 left-[18px] h-[26px] w-[26px] text-ens-gray"
          strokeWidth={1.5}
        />
      </div>
    )
  },
)

SearchField.displayName = 'SearchField'
