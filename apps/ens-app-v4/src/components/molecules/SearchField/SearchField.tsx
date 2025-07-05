import { Mic, Search } from 'lucide-react'
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

    const handleSearchClick = () => {
      if (onSearch && ref && 'current' in ref && ref.current) {
        onSearch(ref.current.value)
      }
    }

    const handleMicClick = () => {
      // Mic functionality placeholder - does nothing for now
      console.log('Mic clicked - functionality not implemented yet')
    }

    return (
      <div className={cn('relative w-full', className)}>
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
            'w-full rounded-lg border border-border px-4 py-4 pr-20 text-base',
            'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring',
            'bg-background text-foreground placeholder:text-muted-foreground',
            disabled && 'cursor-not-allowed bg-muted',
            'transition-all duration-200',
          )}
        />

        {/* Right side icons container */}
        <div className="-translate-y-1/2 absolute top-1/2 right-3 flex transform items-center gap-2">
          {/* Microphone icon */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={disabled}
            className={cn(
              'rounded-full p-2 transition-colors hover:bg-muted',
              'text-muted-foreground hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-50',
            )}
            aria-label="Voice search"
          >
            <Mic className="h-5 w-5" />
          </button>

          {/* Search icon */}
          <button
            type="button"
            onClick={handleSearchClick}
            disabled={disabled}
            className={cn(
              'rounded-full p-2 transition-colors hover:bg-muted',
              'text-muted-foreground hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-50',
            )}
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
      </div>
    )
  },
)

SearchField.displayName = 'SearchField'
