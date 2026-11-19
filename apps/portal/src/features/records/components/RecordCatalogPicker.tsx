import type {
  AddressRecordOption,
  TextRecordOption,
} from '@ens-apps/record-catalog'
import { X } from 'lucide-react'
import { type ReactNode, type RefObject, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  AddressRecordArtwork,
  type ArtworkViewport,
  TextRecordArtwork,
  useArtworkViewport,
} from './RecordArtwork'

type CatalogDetail<T> = {
  readonly label: string
  readonly getValue: (option: T) => string | undefined
}

type Catalog<T> = {
  readonly title: string
  readonly description: string
  readonly placeholder: string
  readonly nameLabel: string
  readonly details: readonly CatalogDetail<T>[]
  /** Grid columns for the name column followed by each detail. */
  readonly columns: string
  readonly getId: (option: T) => string
  readonly renderArtwork: (
    option: T,
    viewport: ArtworkViewport | undefined,
    className?: string,
  ) => ReactNode
  readonly getEmptyMessage: (query: string) => string
}

const TEXT_CATALOG: Catalog<TextRecordOption> = {
  title: 'Text records',
  description: 'Pick a known text record to fill in its key.',
  placeholder: 'Search by name or key',
  nameLabel: 'Name',
  details: [{ label: 'Key', getValue: (option) => option.key }],
  columns: 'grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]',
  getId: (option) => option.key,
  // Text glyphs are inline SVG, so they need no viewport.
  renderArtwork: (option, _viewport, className) => (
    <TextRecordArtwork option={option} className={className} />
  ),
  getEmptyMessage: (query) =>
    query
      ? `No known text record matches “${query}”.`
      : 'No known text records available to add.',
}

const ADDRESS_CATALOG: Catalog<AddressRecordOption> = {
  title: 'Coins and chains',
  description: 'Pick a coin or chain to fill in its coin type.',
  placeholder: 'Search by name, coin type or chain ID',
  nameLabel: 'Chain',
  details: [
    { label: 'Coin type', getValue: (option) => String(option.coinType) },
    {
      label: 'EVM chain ID',
      getValue: (option) =>
        option.chainId === undefined ? undefined : String(option.chainId),
    },
  ],
  // Wide enough for a ten-digit coin type and chain ID without wrapping.
  columns: 'grid-cols-[minmax(0,1fr)_7.5rem_7rem]',
  getId: (option) => String(option.coinType),
  renderArtwork: (option, viewport, className) => (
    <AddressRecordArtwork
      option={option}
      viewport={viewport}
      className={className}
    />
  ),
  getEmptyMessage: (query) =>
    query
      ? `No coin or chain matches “${query}”.`
      : 'No coins or chains available to add.',
}

type RecordCatalogPickerProps<T> = {
  /** Button that opens the catalog. */
  readonly trigger: ReactNode
  /** Field shown before the trigger; the desktop popover lines up with it. */
  readonly children?: ReactNode
  readonly search: (query: string) => readonly T[]
  readonly onSelect: (option: T) => void
  /** Receives focus after a pick, so the next step is the value. */
  readonly focusAfterSelectRef?: RefObject<HTMLElement | null>
  readonly isDisabled?: boolean
}

const CatalogResults = <T extends { readonly name: string }>({
  catalog,
  search,
  isStacked,
  onSelect,
  onClose,
}: {
  readonly catalog: Catalog<T>
  readonly search: (query: string) => readonly T[]
  readonly isStacked: boolean
  readonly onSelect: (option: T) => void
  readonly onClose?: () => void
}) => {
  const [query, setQuery] = useState('')
  const options = search(query)
  const { listRef, viewport } = useArtworkViewport()

  return (
    <Command
      shouldFilter={false}
      label={`Search ${catalog.title.toLowerCase()}`}
      className={cn(isStacked && 'min-h-0 flex-1 rounded-none')}
    >
      {/* The search icon lines up with the names below it. */}
      <div className="flex items-center border-b pr-1 [&>[data-slot=command-input-wrapper]]:h-10 [&>[data-slot=command-input-wrapper]]:flex-1 [&>[data-slot=command-input-wrapper]]:border-b-0 [&>[data-slot=command-input-wrapper]]:pl-4">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={catalog.placeholder}
        />
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            onClick={onClose}
          >
            <X aria-hidden="true" />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>
      {!isStacked && options.length > 0 && (
        <div
          aria-hidden="true"
          className={cn(
            'grid gap-4 border-b px-4 py-2 text-small text-muted-foreground',
            catalog.columns,
          )}
        >
          {/* Lines up with the names, past their artwork. */}
          <span className="pl-8">{catalog.nameLabel}</span>
          {catalog.details.map((detail) => (
            <span key={detail.label}>{detail.label}</span>
          ))}
        </div>
      )}
      <CommandList
        ref={listRef}
        className={cn(
          'p-1',
          isStacked ? 'max-h-none min-h-0 flex-1' : 'max-h-80',
        )}
      >
        <CommandEmpty className="px-4 py-6 text-center text-p text-muted-foreground">
          {catalog.getEmptyMessage(query.trim())}
        </CommandEmpty>
        {options.map((option) => (
          <CommandItem
            key={catalog.getId(option)}
            value={catalog.getId(option)}
            onSelect={() => onSelect(option)}
            className={cn(
              'cursor-pointer px-3',
              isStacked
                ? 'gap-3 py-2.5'
                : cn('grid gap-4 py-2', catalog.columns),
            )}
          >
            {isStacked ? (
              <>
                {catalog.renderArtwork(option, viewport, 'size-6')}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate">{option.name}</span>
                  <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-small text-muted-foreground">
                    {catalog.details.map((detail) => {
                      const value = detail.getValue(option)
                      return value === undefined ? null : (
                        <span key={detail.label}>
                          {detail.label}{' '}
                          <span className="font-mono text-foreground">
                            {value}
                          </span>
                        </span>
                      )
                    })}
                  </span>
                </span>
              </>
            ) : (
              <>
                <span className="flex min-w-0 items-center gap-3">
                  {catalog.renderArtwork(option, viewport)}
                  <span className="truncate">{option.name}</span>
                </span>
                {catalog.details.map((detail) => {
                  const value = detail.getValue(option)
                  return (
                    <span key={detail.label} className="min-w-0 break-all">
                      <span className="sr-only">{detail.label} </span>
                      {value === undefined ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="text-muted-foreground"
                          >
                            —
                          </span>
                          <span className="sr-only">none</span>
                        </>
                      ) : (
                        <span className="font-mono">{value}</span>
                      )}
                    </span>
                  )
                })}
              </>
            )}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  )
}

/**
 * Opens a searchable list of known records next to a key field: a popover on
 * desktop and a bottom sheet on narrow screens. Picking only reports the
 * option; the form decides what to fill in.
 */
const RecordCatalogPicker = <T extends { readonly name: string }>({
  catalog,
  trigger,
  children,
  search,
  onSelect,
  focusAfterSelectRef,
  isDisabled = false,
}: RecordCatalogPickerProps<T> & { readonly catalog: Catalog<T> }) => {
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)
  const hasPicked = useRef(false)
  const isShown = isOpen && !isDisabled

  const handleOpenChange = (open: boolean) => {
    if (open) hasPicked.current = false
    setIsOpen(open)
  }

  const handleSelect = (option: T) => {
    hasPicked.current = true
    onSelect(option)
    setIsOpen(false)
  }

  // After a pick, move on to the value instead of back to the trigger.
  const handleCloseAutoFocus = (event: Event) => {
    if (!hasPicked.current || !focusAfterSelectRef?.current) return
    event.preventDefault()
    focusAfterSelectRef.current.focus()
  }

  if (isMobile) {
    return (
      <Sheet open={isShown} onOpenChange={handleOpenChange}>
        <div className="flex min-w-0 gap-2">
          {children}
          <SheetTrigger asChild>{trigger}</SheetTrigger>
        </div>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          // Fixed height keeps search in place as results filter.
          className="h-[85dvh] gap-0 rounded-t-lg bg-popover text-popover-foreground pb-[env(safe-area-inset-bottom)]"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            const panel = event.currentTarget
            if (!(panel instanceof HTMLElement)) return
            // On touch, an open keyboard would hide most of the list.
            const isTouch = window.matchMedia('(pointer: coarse)').matches
            const search = panel.querySelector<HTMLElement>('[cmdk-input]')
            const focusTarget = isTouch ? panel : (search ?? panel)
            focusTarget.focus()
          }}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <SheetHeader className="flex-row items-center justify-between gap-2 pt-3 pr-1 pb-1">
            <SheetTitle className="text-h3">{catalog.title}</SheetTitle>
            <SheetDescription className="sr-only">
              {catalog.description}
            </SheetDescription>
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 text-muted-foreground"
              >
                <X aria-hidden="true" />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>
          </SheetHeader>
          <CatalogResults
            catalog={catalog}
            search={search}
            isStacked
            onSelect={handleSelect}
          />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={isShown} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <div className="flex min-w-0 gap-2">
          {children}
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        collisionPadding={16}
        aria-label={catalog.title}
        className="w-[min(36rem,calc(100vw-2rem))] overflow-hidden border p-0"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <CatalogResults
          catalog={catalog}
          search={search}
          isStacked={false}
          onSelect={handleSelect}
          onClose={() => setIsOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

export const TextRecordPicker = (
  props: RecordCatalogPickerProps<TextRecordOption>,
) => <RecordCatalogPicker catalog={TEXT_CATALOG} {...props} />

export const AddressRecordPicker = (
  props: RecordCatalogPickerProps<AddressRecordOption>,
) => <RecordCatalogPicker catalog={ADDRESS_CATALOG} {...props} />
