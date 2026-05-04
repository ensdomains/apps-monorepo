import { Popover } from '@base-ui/react'
import { useRef, useState } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { SearchInput } from './SearchInput'
import { SearchSuggestions } from './SearchSuggestions'

export const DesktopSearch = () => {
  const triggerRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const { debouncedValue: debouncedSearchValue } = useDebounce(searchValue, {
    delay: 500,
  })

  const resetSearch = () => {
    setIsOpen(false)
    setSearchValue('')
  }

  return (
    // <div className="relative flex min-w-0 flex-1">
    <Popover.Root
      onOpenChange={(open, { reason, cancel }) => {
        // Prevent closing the popover when the trigger is pressed
        if (reason === 'trigger-press' && !open) {
          cancel()
          return
        }
        setIsOpen(open)
      }}
      open={isOpen}
    >
      {/* <SearchInput
        isLoading={debouncedSearchValue !== searchValue}
        onBlur={(e) => {
          console.log(e)
          setIsOpen(false)
        }}
        onFocus={() => setIsOpen(true)}
        searchValue={searchValue}
        setSearchValue={setSearchValue}
        wrapperProps={{ ref: triggerRef }}
      /> */}
      <Popover.Trigger
        nativeButton={false}
        render={(props) => (
          <SearchInput
            isLoading={debouncedSearchValue !== searchValue}
            searchValue={searchValue}
            setSearchValue={setSearchValue}
            wrapperProps={props}
          />
        )}
      />
      {/* <Popover.Content align="start" className="w-full" initialFocus={false}>
          <SearchSuggestions
            onNavigate={resetSearch}
            searchValue={debouncedSearchValue}
          />
        </Popover.Content> */}
      <Popover.Portal>
        <Popover.Positioner
          anchor={triggerRef.current}
          className="isolate z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width)"
          positionMethod="fixed"
          sideOffset={16}
        >
          <Popover.Popup
            className="slide-in-from-top-2 data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 w-(--anchor-width) origin-(--transform-origin) rounded bg-white transition-all duration-100 data-closed:animate-out data-open:animate-in"
            initialFocus={false}
          >
            <SearchSuggestions
              isLoading={debouncedSearchValue !== searchValue}
              onNavigate={resetSearch}
              searchValue={debouncedSearchValue}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
