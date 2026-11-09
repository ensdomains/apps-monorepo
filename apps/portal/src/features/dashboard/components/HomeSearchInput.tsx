import { applyPastedNameSearch } from '@ens-apps/utils/normalizePastedNameSearch'
import { formatForDisplay } from '@tanstack/react-hotkeys'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { type KeyboardEvent, useCallback, useId, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { isAddress } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { Button } from '@/components/ui/button'
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
import { useCommandPalette } from '@/features/command-palette/context'
import { PaletteTrigger } from '@/features/command-palette/PaletteTrigger'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { ensureEthSuffix } from '@/utils/ens/ensureEthSuffix'
import { useSearchResults } from '../hooks/useSearchResults'
import {
  getInlineSearchKeyAction,
  getInlineSearchSelection,
} from '../utils/searchResultsUtils'
import { SearchResultsList } from './SearchResultsList'

const SEARCH_DEBOUNCE_MS = 300

export const HomeSearchInput = ({
  className,
  iconOnly = false,
  isHero = false,
  ariaLabel,
}: {
  readonly className?: string
  readonly iconOnly?: boolean
  /** Landing-page hero: larger field with the typed-entity hint. */
  readonly isHero?: boolean
  readonly ariaLabel?: string
}) => {
  const listboxId = useId()
  const navigate = useNavigate()
  const [searchValue, setSearchValue] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedValue, setSelectedValue] = useState<string | null>(null)
  const { isAvailable: isPaletteAvailable, openPalette } = useCommandPalette()
  const triggerRef = useRef<HTMLDivElement | null>(null)

  const trimmedSearch = useDebouncedValue(
    searchValue,
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
  const navigateToResolver = useCallback(
    (address: string) => {
      if (!isAddress(address, { strict: false })) return
      navigate({ to: '/resolver/$address', params: { address } })
    },
    [navigate],
  )

  const navigateToRegister = useCallback(
    (name: string) => {
      navigate({ to: '/register', search: { name: ensureEthSuffix(name) } })
    },
    [navigate],
  )

  const searchResults = useSearchResults({
    searchValue: trimmedSearch,
    enabled: Boolean(trimmedSearch),
    fetchOwnedNames: false,
    navigateToName,
    navigateToAddress,
    navigateToResolver,
  })
  const {
    allItems,
    hasAnySection,
    searchNotice,
    suggestions,
    ownerBySuggestionId,
    offchainNameIds,
    availableNames,
    pendingAvailabilityIds,
    ownedNamesFiltered,
    nameVerificationBySuggestionId,
  } = searchResults

  const isCurrentQuery = searchValue.trim() === trimmedSearch
  const selection = {
    items: allItems,
    selectedValue,
    verification: nameVerificationBySuggestionId,
  }
  const activeItem = getInlineSearchSelection(selection)
  const activeIndex = allItems.findIndex(
    ({ value }) => value === activeItem?.value,
  )
  const isPopoverOpen =
    menuOpen && isCurrentQuery && (hasAnySection || Boolean(searchNotice))
  const updateSearchValue = useCallback((value: string) => {
    setSearchValue(value)
    setSelectedValue(null)
    setMenuOpen(Boolean(value.trim()))
  }, [])

  const closePopover = useCallback(() => {
    setMenuOpen(false)
    triggerRef.current?.querySelector('input')?.blur()
  }, [])

  const handleSelectByValue = useCallback(
    (value: string) => {
      const item = allItems.find((candidate) => candidate.value === value)
      if (!item) return
      closePopover()
      updateSearchValue('')
      match(item)
        .with({ type: 'owned' }, ({ name }) => navigateToName(name))
        .with({ type: 'register' }, ({ name }) => navigateToRegister(name))
        .with({ type: 'suggestion' }, ({ suggestion }) => suggestion.action())
        .exhaustive()
    },
    [
      allItems,
      closePopover,
      navigateToName,
      navigateToRegister,
      updateSearchValue,
    ],
  )

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = getInlineSearchKeyAction({
      ...selection,
      key: event.key,
      isComposing: event.nativeEvent.isComposing || event.keyCode === 229,
      isCurrentQuery,
    })
    match(action)
      .with({ type: 'ignore' }, () => {})
      .with({ type: 'close' }, () => setMenuOpen(false))
      .with({ type: 'move' }, ({ value }) => {
        event.preventDefault()
        setSelectedValue(value)
      })
      .with({ type: 'select' }, ({ value }) => {
        event.preventDefault()
        handleSelectByValue(value)
      })
      .exhaustive()
  }

  if (iconOnly) return <PaletteTrigger iconOnly className={className} />

  return (
    <div className="flex w-full flex-col gap-2">
      <Popover
        modal={false}
        open={isPopoverOpen}
        onOpenChange={(open) => !open && setMenuOpen(false)}
      >
        <PopoverTrigger asChild>
          <InputGroup
            ref={triggerRef}
            className={cn(
              isHero
                ? 'h-13.5 w-full rounded-md border-neutral-3 pr-2 pl-0.75 shadow-none hover:border-neutral-4 has-[input:focus]:border-neutral-5'
                : 'bg-sidebar-accent dark:bg-sidebar-accent rounded-sm max-w-3xl w-full',
              className,
            )}
            onClick={(e) => e.preventDefault()}
          >
            <InputGroupAddon align="inline-start">
              <Search
                className={cn('size-4', isHero && 'size-5 text-neutral-8')}
              />
            </InputGroupAddon>
            <InputGroupInput
              id={listboxId}
              role="combobox"
              aria-expanded={isPopoverOpen}
              aria-controls={`${listboxId}-listbox`}
              aria-activedescendant={
                isPopoverOpen && activeIndex >= 0
                  ? `${listboxId}-opt-${activeIndex}`
                  : undefined
              }
              aria-autocomplete="list"
              aria-label={ariaLabel}
              className={cn(
                'w-full',
                isHero &&
                  'placeholder:text-neutral-8 sm:placeholder:text-transparent',
              )}
              placeholder={isHero ? 'Search' : 'Search...'}
              value={searchValue}
              onFocus={(e) => e.target.value.trim() && setMenuOpen(true)}
              onChange={(e) => updateSearchValue(e.target.value)}
              onKeyDown={onSearchKeyDown}
              onPaste={(event) =>
                applyPastedNameSearch(event, updateSearchValue)
              }
            />
            {isHero && !searchValue && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-11 top-1/2 hidden -translate-y-1/2 text-base text-foreground group-focus-within/input-group:hidden sm:block"
              >
                Search for a <EntityBadge variant="name">name</EntityBadge>,{' '}
                <EntityBadge variant="address">wallet</EntityBadge>, or{' '}
                <EntityBadge variant="contract">contract</EntityBadge>
              </span>
            )}
            <InputGroupAddon align="inline-end">
              <kbd
                className={cn(
                  'pointer-events-none select-none items-center gap-1',
                  isHero
                    ? 'flex font-sans text-base font-normal text-neutral-5'
                    : 'hidden h-5 rounded border px-1.5 text-smallmono font-medium text-muted-foreground sm:flex',
                )}
              >
                <span className="translate-y-px">
                  {formatForDisplay('Mod+K')}
                </span>
              </kbd>
            </InputGroupAddon>
          </InputGroup>
        </PopoverTrigger>
        <PopoverContent
          onEscapeKeyDown={(event) => {
            if (event.isComposing) event.preventDefault()
          }}
          align="start"
          className={cn(
            'p-1 max-h-[min(60vh,400px)] overflow-y-auto max-w-[min(28rem,calc(100vw-1rem))]',
            // min-width beats max-width below the minimum, so the cap repeats inside it
            hasAnySection
              ? 'w-max min-w-[min(max(var(--radix-popover-trigger-width),20rem),calc(100vw-1rem))]'
              : 'w-(--radix-popover-trigger-width)',
          )}
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {searchNotice && (
            <div className="px-3 py-2 text-p text-message-warning-text">
              {searchNotice}
            </div>
          )}
          {hasAnySection && (
            <div
              role="listbox"
              id={`${listboxId}-listbox`}
              className="flex flex-col"
            >
              <SearchResultsList
                suggestions={suggestions}
                ownerBySuggestionId={ownerBySuggestionId}
                offchainNameIds={offchainNameIds}
                availableNames={availableNames}
                pendingAvailabilityIds={pendingAvailabilityIds}
                ownedNamesFiltered={ownedNamesFiltered}
                nameVerificationBySuggestionId={nameVerificationBySuggestionId}
                onSelect={handleSelectByValue}
                variant="listbox"
                listboxId={listboxId}
                activeIndex={activeIndex}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>

      {isHero && isPaletteAvailable && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 text-small text-muted-foreground"
            aria-label="Search actions"
            aria-keyshortcuts="Control+K Meta+K"
            onClick={() => {
              closePopover()
              openPalette({ query: searchValue })
            }}
          >
            Search actions
            <kbd className="rounded border px-1 text-small">
              {formatForDisplay('Mod+K')}
            </kbd>
          </Button>
        </div>
      )}
    </div>
  )
}
