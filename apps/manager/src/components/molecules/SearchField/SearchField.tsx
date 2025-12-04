import { Search } from 'lucide-react'
import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface SearchFieldProps
  extends InputHTMLAttributes<HTMLInputElement> {
  placeholder?: string
  onSearch?: (value: string) => void
  wrapperClassName?: string
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ onSearch, className, wrapperClassName, onKeyDown, ...props }, ref) => {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && onSearch) {
        onSearch(event.currentTarget.value)
      }
      onKeyDown?.(event)
    }

    return (
      <div
        className={cn(
          'relative flex items-center gap-[15px]',
          wrapperClassName,
        )}
      >
        <input
          ref={ref}
          type="text"
          onKeyDown={handleKeyDown}
          className={cn(
            'size-full self-stretch',
            'font-sans font-semibold text-xl leading-[110%] tracking-[-0.4px]',
            'py-[21px] pr-[28px] pl-[52px]',
            'rounded border-[0.25px] border-ens-gray-two',
            'bg-ens-white text-ens-blue',
            'shadow-md',
            'transition-all duration-200 ease-in-out',
            'placeholder:text-ens-lapis-surface',
            'focus:border-transparent focus:outline-none',
            'focus:ring-2 focus:ring-blue-500/20',
            'disabled:cursor-not-allowed',
            className,
          )}
          {...props}
        />

        <Search
          aria-hidden
          className="-translate-y-1/2 absolute top-1/2 left-[18px] size-[26px] text-ens-lapis-dust"
          strokeWidth={2.15}
        />
      </div>
    )
  },
)

SearchField.displayName = 'SearchField'
