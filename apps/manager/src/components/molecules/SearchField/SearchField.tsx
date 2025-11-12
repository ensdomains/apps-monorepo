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
      disabled = false,
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
      <div className={cn('search-field', className)}>
        <input
          ref={ref}
          type="text"
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={cn('search-field-input', disabled && 'cursor-not-allowed')}
        />

        <Search aria-hidden className="search-field__icon" strokeWidth={1.5} />
      </div>
    )
  },
)

SearchField.displayName = 'SearchField'
