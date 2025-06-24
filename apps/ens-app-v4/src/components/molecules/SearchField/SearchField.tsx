import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from '../../atoms/Button'
import { Input, type InputProps } from '../../atoms/Input'

export interface SearchFieldProps extends Omit<InputProps, 'endIcon'> {
  buttonText?: string
  buttonProps?: Partial<ButtonProps>
  onSearch?: (value: string) => void
  showSearchIcon?: boolean
  searchIconElement?: React.ReactNode
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  (
    {
      buttonText = 'Search',
      buttonProps,
      onSearch,
      showSearchIcon = true,
      searchIconElement,
      className,
      ...inputProps
    },
    ref,
  ) => {
    const handleSearch = () => {
      if (onSearch && ref && 'current' in ref && ref.current) {
        onSearch(ref.current.value)
      }
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        handleSearch()
      }
      inputProps.onKeyDown?.(event)
    }

    const defaultSearchIcon = (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-label="Search"
      >
        <title>Search</title>
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>
    )

    const searchIconDisplay = searchIconElement || defaultSearchIcon

    if (showSearchIcon) {
      return (
        <div className={cn('flex gap-2', className)}>
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
              {searchIconDisplay}
            </div>
            <Input
              ref={ref}
              className="pl-10"
              onKeyDown={handleKeyDown}
              {...inputProps}
            />
          </div>
          <Button onClick={handleSearch} {...buttonProps}>
            {buttonText}
          </Button>
        </div>
      )
    }

    return (
      <div className={cn('flex gap-2', className)}>
        <Input
          ref={ref}
          className="flex-1"
          onKeyDown={handleKeyDown}
          {...inputProps}
        />
        <Button onClick={handleSearch} {...buttonProps}>
          {buttonText}
        </Button>
      </div>
    )
  },
)

SearchField.displayName = 'SearchField'
