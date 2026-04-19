import { useLingui } from '@lingui/react/macro'
import { Loader2Icon, Search, X } from 'lucide-react'
import type { KeyboardEvent, RefObject } from 'react'
import { useRef, useState } from 'react'
import * as Drawer from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import * as Popover from '@/components/ui/popover'
import { useDebounce } from '@/hooks/useDebounce'
import { SearchSuggestions } from './SearchSuggestions'
import { SearchTriggerButton } from './SearchTriggerButton'

interface HeaderSearchSectionProps {
  isDesktop: boolean
}

const SEARCH_INPUT_ID = 'header-search-input'

interface SearchInputProps {
  searchValue: string
  setSearchValue: (value: string) => void
  onFocus: () => void
  onEnter: () => void
  isLoading?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
}

const SearchInput = ({
  searchValue,
  setSearchValue,
  onFocus,
  onEnter,
  isLoading = false,
  inputRef,
}: SearchInputProps) => {
  const { t } = useLingui()

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return

    // Keep IME composition guard to avoid Enter submitting unfinished composition text.
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return
    }

    event.preventDefault()
    onEnter()
  }

  return (
    <div className="relative flex-1">
      <Input
        aria-label={t`Search for a name or address`}
        autoComplete="off"
        className="h-[44px] rounded-[4px] border-[0.4px] border-ens-gray-two bg-white text-muted-foreground placeholder:text-muted-foreground"
        endIcon={
          isLoading ? (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          ) : searchValue ? (
            <button
              aria-label={t`Clear search`}
              className="flex items-center justify-center"
              onClick={() => setSearchValue('')}
              type="button"
            >
              <X className="size-4 text-muted-foreground" />
            </button>
          ) : undefined
        }
        id={SEARCH_INPUT_ID}
        onChange={(event) => setSearchValue(event.target.value)}
        onFocus={onFocus}
        onKeyDown={handleKeyDown}
        placeholder={t`Search name, address...`}
        ref={inputRef}
        size="default"
        startIcon={<Search className="size-[18px] text-muted-foreground" />}
        value={searchValue}
      />
    </div>
  )
}

export const HeaderSearchSection = ({
  isDesktop,
}: HeaderSearchSectionProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsContainerRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const { debouncedValue: debouncedSearchValue } = useDebounce(searchValue, {
    delay: 500,
  })

  const handleEnterNavigate = () => {
    if (debouncedSearchValue !== searchValue) return

    const firstSuggestion =
      suggestionsContainerRef.current?.querySelector<HTMLAnchorElement>(
        'a[href]',
      )

    if (!firstSuggestion) return

    inputRef.current?.blur()
    firstSuggestion.click()
  }

  if (isDesktop) {
    return (
      <div className="relative flex flex-1">
        <Popover.Popover onOpenChange={setIsOpen} open={isOpen}>
          <Popover.PopoverAnchor asChild>
            <div className="flex max-w-sm flex-1">
              <SearchInput
                inputRef={inputRef}
                isLoading={debouncedSearchValue !== searchValue}
                onEnter={handleEnterNavigate}
                onFocus={() => setIsOpen(true)}
                searchValue={searchValue}
                setSearchValue={setSearchValue}
              />
            </div>
          </Popover.PopoverAnchor>
          <Popover.PopoverContent
            align="start"
            className="max-h-[400px] w-(--radix-popover-trigger-width) overflow-y-auto p-0"
            onInteractOutside={(e) => {
              // Prevent closing the popover when interacting with the input but still close if outside the input
              if (
                e.target instanceof Element &&
                e.target.id === SEARCH_INPUT_ID
              ) {
                e.preventDefault()
              }
            }}
            onOpenAutoFocus={(e) => e.preventDefault()}
            side="bottom"
            sideOffset={4}
          >
            <SearchSuggestions
              containerRef={suggestionsContainerRef}
              onNavigate={() => {
                setIsOpen(false)
                setSearchValue('')
              }}
              searchValue={debouncedSearchValue}
            />
          </Popover.PopoverContent>
        </Popover.Popover>
      </div>
    )
  }

  // Mobile implementation with Drawer
  return (
    <Drawer.Drawer direction="top" onOpenChange={setIsOpen} open={isOpen}>
      <Drawer.DrawerTrigger asChild>
        <SearchTriggerButton />
      </Drawer.DrawerTrigger>
      <Drawer.DrawerContent className="max-h-[80vh] space-y-4 px-4 pt-4 pb-6">
        <div className="flex items-center gap-2">
          <SearchInput
            inputRef={inputRef}
            isLoading={debouncedSearchValue !== searchValue}
            onEnter={handleEnterNavigate}
            onFocus={() => setIsOpen(true)}
            searchValue={searchValue}
            setSearchValue={setSearchValue}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <SearchSuggestions
            containerRef={suggestionsContainerRef}
            onNavigate={() => {
              setIsOpen(false)
              setSearchValue('')
            }}
            searchValue={debouncedSearchValue}
          />
        </div>
      </Drawer.DrawerContent>
    </Drawer.Drawer>
  )
}
