import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type Address, checksumAddress, isAddress } from 'viem'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { normalizeEnsName } from '@/utils/ens/normalizeEnsName'

const SEARCH_DEBOUNCE_MS = 300

type Suggestion = {
  id: string
  label: string
  description?: string
  action: () => void
  inputValue: string
}

export const HomeSearchInput = () => {
  const searchNamesAndAddressesId = useId()
  const navigate = useNavigate({ from: '/' })
  const [searchValue, setSearchValue] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)

  const triggerRef = useRef<HTMLDivElement | null>(null)

  const debouncedSearchValue = useDebouncedValue(
    searchValue,
    SEARCH_DEBOUNCE_MS,
  )
  const trimmedSearch = debouncedSearchValue.trim()

  const buildSuggestions = useCallback(
    (value: string): Suggestion[] => {
      if (!value) return []
      const items: Suggestion[] = []
      if (isAddress(value, { strict: false })) {
        try {
          const checksum = checksumAddress(value as Address)
          items.push({
            id: `address:${checksum}`,
            label: checksum,
            description: 'View address details',
            inputValue: checksum,
            action: () =>
              navigate({
                to: '/addr/$addr',
                params: { addr: checksum },
              }),
          })
        } catch {
          return []
        }
      }
      const normalizedName = normalizeEnsName(value)
      items.push({
        id: `name:${normalizedName}`,
        label: normalizedName,
        description: 'View ENS name details',
        inputValue: normalizedName,
        action: () =>
          navigate({
            to: '/$name',
            params: { name: normalizedName },
          }),
      })
      return items
    },
    [navigate],
  )

  const suggestions = useMemo<Suggestion[]>(
    () => buildSuggestions(trimmedSearch),
    [buildSuggestions, trimmedSearch],
  )

  useEffect(() => {
    setMenuOpen(Boolean(trimmedSearch))
  }, [trimmedSearch])

  useEffect(() => {
    setActiveIndex(suggestions.length ? 0 : -1)
  }, [suggestions.length])

  const handleSuggestionSelect = (suggestion: Suggestion) => {
    setSearchValue(suggestion.inputValue)
    setMenuOpen(false)
    triggerRef.current?.querySelector('input')?.blur()
    suggestion.action()
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value)
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
      return
    }
    if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
      return
    }
    if (event.key === 'Enter') {
      const s = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0]
      if (s) {
        event.preventDefault()
        handleSuggestionSelect(s)
      }
      return
    }
    if (event.key === 'Escape') {
      setMenuOpen(false)
    }
  }

  const activeOptionId =
    activeIndex >= 0
      ? `${searchNamesAndAddressesId}-opt-${activeIndex}`
      : undefined

  return (
    <Popover
      modal={false}
      open={menuOpen && suggestions.length > 0}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setMenuOpen(false)
      }}
    >
      <PopoverTrigger asChild>
        <InputGroup
          ref={triggerRef}
          className="bg-white rounded-sm max-w-3xl w-full"
          // Popover trigger is controlling the open state based on the onClick event, since we want to control it ourselves we need to prevent the default event
          onClick={(event) => event.preventDefault()}
        >
          <InputGroupInput
            id={searchNamesAndAddressesId}
            role="combobox"
            aria-expanded={menuOpen && suggestions.length > 0}
            aria-controls={`${searchNamesAndAddressesId}-listbox`}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            className="w-full"
            placeholder="Search name or address..."
            value={searchValue}
            onFocus={(event) => {
              if (event.target.value.trim()) setMenuOpen(true)
            }}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
          />
          <InputGroupAddon align="inline-end">
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="p-1 w-(--radix-popover-trigger-width)"
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {suggestions.length > 0 && (
          <div
            role="listbox"
            id={`${searchNamesAndAddressesId}-listbox`}
            className="flex flex-col"
          >
            {suggestions.map((suggestion, i) => {
              const optionId = `${searchNamesAndAddressesId}-opt-${i}`
              const isActive = i === activeIndex
              return (
                <button
                  key={suggestion.id}
                  id={optionId}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`flex flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent hover:text-accent-foreground'
                  }`}
                  onClick={() => handleSuggestionSelect(suggestion)}
                >
                  <span className="font-medium">{suggestion.label}</span>
                  {suggestion.description && (
                    <span className="text-xs text-muted-foreground">
                      {suggestion.description}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
