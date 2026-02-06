import { useNavigate } from '@tanstack/react-router'
import { Command as CommandIcon, Search } from 'lucide-react'
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
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
import { useIsMobile } from '@/hooks/use-mobile'
import { useDebouncedValue } from '@/hooks/useDebounce'
import {
  buildSearchSuggestions,
  type Suggestion,
} from '../utils/buildSearchSuggestions'

const SEARCH_DEBOUNCE_MS = 300

/** Detect if user is on macOS */
const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0

export const HomeSearchInput = () => {
  const searchNamesAndAddressesId = useId()
  const navigate = useNavigate({ from: '/' })
  const isMobile = useIsMobile()

  // Inline search state
  const [searchValue, setSearchValue] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const triggerRef = useRef<HTMLDivElement | null>(null)

  // Modal search state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSearchValue, setModalSearchValue] = useState('')

  const debouncedSearchValue = useDebouncedValue(
    searchValue,
    SEARCH_DEBOUNCE_MS,
  )
  const trimmedSearch = debouncedSearchValue.trim()

  const debouncedModalSearchValue = useDebouncedValue(
    modalSearchValue,
    SEARCH_DEBOUNCE_MS,
  )
  const trimmedModalSearch = debouncedModalSearchValue.trim()

  // Navigation callbacks
  const navigateToAddress = useCallback(
    (address: string) => {
      navigate({
        to: '/addr/$addr',
        params: { addr: address },
      })
    },
    [navigate],
  )

  const navigateToName = useCallback(
    (name: string) => {
      navigate({
        to: '/$name',
        params: { name },
      })
    },
    [navigate],
  )

  // Suggestions for inline search
  const suggestions = useMemo(
    () =>
      buildSearchSuggestions({
        value: trimmedSearch,
        isMobile,
        navigateToAddress,
        navigateToName,
      }),
    [trimmedSearch, isMobile, navigateToAddress, navigateToName],
  )

  // Suggestions for modal search
  const modalSuggestions = useMemo(
    () =>
      buildSearchSuggestions({
        value: trimmedModalSearch,
        isMobile,
        navigateToAddress,
        navigateToName,
      }),
    [trimmedModalSearch, isMobile, navigateToAddress, navigateToName],
  )

  useEffect(() => {
    setMenuOpen(Boolean(trimmedSearch))
  }, [trimmedSearch])

  useEffect(() => {
    setActiveIndex(suggestions.length ? 0 : -1)
  }, [suggestions.length])

  // Global keyboard shortcut: Cmd+K (Mac) or Ctrl+K (Windows/Linux)
  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      const isModifierPressed = isMac ? event.metaKey : event.ctrlKey
      if (isModifierPressed && event.key === 'k') {
        event.preventDefault()
        setModalOpen(true)
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Reset modal search when it closes
  useEffect(() => {
    if (!modalOpen) {
      setModalSearchValue('')
    }
  }, [modalOpen])

  const handleSuggestionSelect = (suggestion: Suggestion) => {
    setSearchValue(suggestion.inputValue)
    setMenuOpen(false)
    triggerRef.current?.querySelector('input')?.blur()
    suggestion.action()
  }

  const handleModalSelect = (suggestionId: string) => {
    const suggestion = modalSuggestions.find((s) => s.id === suggestionId)
    if (suggestion) {
      setModalOpen(false)
      suggestion.action()
    }
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
    <>
      {/* Inline Search Input with Popover */}
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
            <InputGroupAddon align="inline-end" className="gap-2">
              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
                {isMac ? (
                  <>
                    <CommandIcon className="size-3" />K
                  </>
                ) : (
                  'Ctrl K'
                )}
              </kbd>
              <Search className="size-4" />
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

      {/* Modal Search Dialog (opened with Cmd+K) */}
      <CommandDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Search"
        description="Search for ENS names or Ethereum addresses"
        showCloseButton={false}
      >
        <CommandInput
          placeholder="Search name or address..."
          value={modalSearchValue}
          onValueChange={setModalSearchValue}
        />
        <CommandList>
          <CommandEmpty>
            {trimmedModalSearch
              ? 'No results found.'
              : 'Type to search for names or addresses...'}
          </CommandEmpty>
          {modalSuggestions.length > 0 && (
            <CommandGroup heading="Suggestions">
              {modalSuggestions.map((suggestion) => (
                <CommandItem
                  key={suggestion.id}
                  value={suggestion.id}
                  onSelect={handleModalSelect}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="font-medium">{suggestion.label}</span>
                  {suggestion.description && (
                    <span className="text-xs text-muted-foreground">
                      {suggestion.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
