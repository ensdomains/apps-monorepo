import { useNavigate } from '@tanstack/react-router'
import { Command as CommandIcon, Search } from 'lucide-react'
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { CommandDialog, CommandInput } from '@/components/ui/command'
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
import { useSearchResults } from '../hooks/useSearchResults'
import type { Suggestion } from '../utils/buildSearchSuggestions'
import { SearchModalContent } from './SearchModalContent'
import { SearchResultsList } from './SearchResultsList'

const SEARCH_DEBOUNCE_MS = 300

const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0

export const HomeSearchInput = () => {
  const listboxId = useId()
  const navigate = useNavigate({ from: '/' })
  const [searchValue, setSearchValue] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSearchValue, setModalSearchValue] = useState('')

  const trimmedSearch = useDebouncedValue(
    searchValue,
    SEARCH_DEBOUNCE_MS,
  ).trim()
  const trimmedModalSearch = useDebouncedValue(
    modalSearchValue,
    SEARCH_DEBOUNCE_MS,
  ).trim()

  const navigateToAddress = useCallback(
    (address: string) => {
      navigate({ to: '/addr/$addr', params: { addr: address } })
    },
    [navigate],
  )
  const navigateToName = useCallback(
    (name: string) => {
      navigate({ to: '/$name', params: { name } })
    },
    [navigate],
  )

  const navigateToRegister = useCallback(
    (name: string) => {
      const nameWithEth = name.includes('.') ? name : `${name}.eth`
      navigate({ to: '/register', search: { name: nameWithEth } })
    },
    [navigate],
  )

  const searchResults = useSearchResults({
    searchValue: trimmedSearch,
    navigateToName,
    navigateToAddress,
  })
  const {
    allItems,
    hasAnySection,
    suggestions,
    ownerBySuggestionId,
    availableNames,
    pendingAvailabilityIds,
    ownedNamesFiltered,
  } = searchResults

  useEffect(() => {
    setMenuOpen(Boolean(trimmedSearch))
  }, [trimmedSearch])
  useEffect(() => {
    setActiveIndex(allItems.length ? 0 : -1)
  }, [allItems.length])

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setModalOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!modalOpen) setModalSearchValue('')
  }, [modalOpen])

  const closePopover = useCallback(() => {
    setMenuOpen(false)
    triggerRef.current?.querySelector('input')?.blur()
  }, [])

  const handleSelectByValue = useCallback(
    (value: string) => {
      closePopover()
      if (value.startsWith('owned:')) {
        setModalOpen(false)
        setMenuOpen(false)
        navigateToName(value.slice('owned:'.length))
        return
      }
      const suggestion = suggestions.find((s) => s.id === value)
      if (suggestion) {
        setSearchValue('')
        const isAvailable = availableNames.some((a) => a.id === suggestion.id)
        if (isAvailable) {
          navigateToRegister(suggestion.inputValue)
        } else {
          suggestion.action()
        }
      }
    },
    [
      closePopover,
      suggestions,
      availableNames,
      navigateToName,
      navigateToRegister,
    ],
  )

  const handleModalSelectSuggestion = useCallback((suggestion: Suggestion) => {
    setModalOpen(false)
    suggestion.action()
  }, [])

  const handleModalSelectAvailableName = useCallback(
    (name: string) => {
      setModalOpen(false)
      navigateToRegister(name)
    },
    [navigateToRegister],
  )

  const handleSelectOwnedName = useCallback(
    (name: string) => {
      setModalOpen(false)
      setMenuOpen(false)
      navigateToName(name)
    },
    [navigateToName],
  )

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && allItems.length) {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % allItems.length)
      return
    }
    if (e.key === 'ArrowUp' && allItems.length) {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + allItems.length) % allItems.length)
      return
    }
    if (e.key === 'Enter') {
      const item = allItems[activeIndex >= 0 ? activeIndex : 0]
      if (item) {
        e.preventDefault()
        handleSelectByValue(item.value)
      }
      return
    }
    if (e.key === 'Escape') setMenuOpen(false)
  }

  return (
    <>
      <Popover
        modal={false}
        open={menuOpen && hasAnySection}
        onOpenChange={(open) => !open && setMenuOpen(false)}
      >
        <PopoverTrigger asChild>
          <InputGroup
            ref={triggerRef}
            className="bg-white rounded-sm max-w-3xl w-full"
            onClick={(e) => e.preventDefault()}
          >
            <InputGroupInput
              id={listboxId}
              role="combobox"
              aria-expanded={menuOpen && hasAnySection}
              aria-controls={`${listboxId}-listbox`}
              aria-activedescendant={
                activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
              }
              aria-autocomplete="list"
              className="w-full"
              placeholder="Search name or address..."
              value={searchValue}
              onFocus={(e) => e.target.value.trim() && setMenuOpen(true)}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={onSearchKeyDown}
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
          className="p-1 w-(--radix-popover-trigger-width) min-w-(--radix-popover-trigger-width) max-h-[min(60vh,400px)] overflow-y-auto"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {hasAnySection && (
            <div
              role="listbox"
              id={`${listboxId}-listbox`}
              className="flex flex-col"
            >
              <SearchResultsList
                suggestions={suggestions}
                ownerBySuggestionId={ownerBySuggestionId}
                availableNames={availableNames}
                pendingAvailabilityIds={pendingAvailabilityIds}
                ownedNamesFiltered={ownedNamesFiltered}
                onSelect={handleSelectByValue}
                variant="listbox"
                listboxId={listboxId}
                activeIndex={activeIndex}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>

      <CommandDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Search"
        description="Search for ENS names or Ethereum addresses"
        showCloseButton={false}
        shouldFilter={false}
      >
        <CommandInput
          placeholder="Search name or address..."
          value={modalSearchValue}
          onValueChange={setModalSearchValue}
        />
        <SearchModalContent
          searchValue={trimmedModalSearch}
          onSelectSuggestion={handleModalSelectSuggestion}
          onSelectOwnedName={handleSelectOwnedName}
          onSelectAvailableName={handleModalSelectAvailableName}
          navigateToName={navigateToName}
          navigateToAddress={navigateToAddress}
        />
      </CommandDialog>
    </>
  )
}
