import { applyPastedNameSearch } from '@ens-apps/utils/normalizePastedNameSearch'
import {
  ArrowLeft,
  ArrowLeftRight,
  BadgeCheck,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  CirclePlus,
  Clock,
  Copy,
  CornerDownLeft,
  Database,
  DatabaseZap,
  FilePen,
  FileText,
  Flame,
  FolderPlus,
  Gem,
  Globe,
  Hash,
  History,
  House,
  KeyRound,
  Link,
  List,
  ListTree,
  type LucideIcon,
  Palette as PaletteIconGlyph,
  Plug,
  Search,
  Send,
  Server,
  ServerCog,
  Settings2,
  ShieldCheck,
  SquareMousePointer,
  Unplug,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  Waypoints,
  Wrench,
  X,
} from 'lucide-react'
import {
  type KeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { match } from 'ts-pattern'
import { EntityBadge } from '@/components/EntityBadge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { parsePaletteQuery } from './core/search'
import type { PaletteFrame, PaletteScreen } from './core/state'
import type { PaletteEntity, PaletteIcon } from './core/types'
import { getTitleParts } from './presentation'
import {
  getEntityLabel,
  getNextRowId,
  getRowEnterLabel,
  getSecondaryRow,
  type PaletteRow,
  type PaletteRowLeading,
  type PaletteRowMeta,
} from './resultModel'
import { usePaletteViewport } from './usePaletteViewport'

const ICONS = {
  name: UserRound,
  edit: FilePen,
  records: FileText,
  renew: CalendarPlus,
  expiring: CalendarClock,
  register: CirclePlus,
  import: Globe,
  subname: FolderPlus,
  subnames: ListTree,
  transfer: Send,
  ownership: KeyRound,
  resolver: Server,
  'change-resolver': ServerCog,
  resolution: Waypoints,
  'reverse-resolution': ArrowLeftRight,
  registry: Database,
  token: Gem,
  history: History,
  fuses: ShieldCheck,
  burn: Flame,
  roles: Users,
  'grant-role': UserPlus,
  copy: Copy,
  hash: Hash,
  link: Link,
  names: List,
  wallet: Wallet,
  'primary-name': BadgeCheck,
  connect: Plug,
  disconnect: Unplug,
  home: House,
  settings: Settings2,
  search: Search,
  page: SquareMousePointer,
  developer: Wrench,
  'time-travel': Clock,
  migration: DatabaseZap,
  'design-qa': PaletteIconGlyph,
} as const satisfies Record<PaletteIcon, LucideIcon>

const META_TONES = {
  muted: 'text-muted-foreground',
  positive: 'text-success-text',
  warning: 'text-warning-text',
  pending: 'text-muted-foreground animate-pulse motion-reduce:animate-none',
} as const satisfies Record<PaletteRowMeta['tone'], string>

type PaletteDialogProps = {
  readonly isOpen: boolean
  readonly frame?: PaletteFrame
  readonly rows: readonly PaletteRow[]
  readonly title: string
  readonly placeholder: string
  readonly notice?: string
  readonly error?: string
  readonly isSearching?: boolean
  readonly canGoBack: boolean
  readonly onClose: () => void
  readonly onBack: () => void
  readonly onQueryChange: (query: string) => void
  readonly onSelectionChange: (selectedId: string) => void
  readonly onScroll: (scrollTop: number) => void
  readonly onActivate: (row: PaletteRow) => void
  readonly onClosed: (event: Event) => void
  readonly onRetry: () => void
  readonly onClearHistory: () => void
}

export const PaletteDialog = ({
  isOpen,
  frame,
  rows,
  title,
  placeholder,
  notice,
  error,
  isSearching,
  canGoBack,
  onClose,
  onBack,
  onQueryChange,
  onSelectionChange,
  onScroll,
  onActivate,
  onClosed,
  onRetry,
  onClearHistory,
}: PaletteDialogProps) => {
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()
  const viewportRef = usePaletteViewport({ isOpen, isMobile })
  const groups = [...new Set(rows.map((row) => row.group))]
  const displayedRows = groups.flatMap((group) =>
    rows.filter((row) => row.group === group),
  )
  const listKey = displayedRows.map((row) => row.id).join('|')
  const scrollTop = frame?.scrollTop ?? 0
  useLayoutEffect(() => {
    if (listRef.current?.dataset.paletteList === listKey)
      listRef.current.scrollTop = scrollTop
  }, [scrollTop, listKey])
  const selectedId = frame?.selectedId || rows.at(0)?.id || ''
  const selectedRow = rows.find((row) => row.id === selectedId)
  const secondaryRow = selectedRow && getSecondaryRow(selectedRow)
  const query = parsePaletteQuery(frame?.query ?? '').query
  const aria = useResultListAria(listRef, selectedId, listKey)
  const shouldRevealSelection = useRef(false)
  useLayoutEffect(() => {
    if (!shouldRevealSelection.current || !listRef.current) return
    shouldRevealSelection.current = false
    revealRow(listRef.current, selectedId)
  }, [selectedId])
  const activateAndFocus = (row: PaletteRow) => {
    onActivate(row)
    inputRef.current?.focus()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const action = getKeyboardAction({
      key: event.key,
      isComposing: event.nativeEvent.isComposing || event.keyCode === 229,
      isShift: event.shiftKey,
      hasQuery: Boolean(frame?.query),
      canGoBack,
      hasSecondary: Boolean(secondaryRow),
      isCaretAtEnd:
        input.selectionStart === input.value.length &&
        input.selectionEnd === input.value.length,
    })
    if (action === 'native') return
    event.stopPropagation()
    if (action === 'composition') return
    event.preventDefault()
    match(action)
      .with('down', 'up', (direction) => {
        shouldRevealSelection.current = true
        onSelectionChange(
          getNextRowId(
            displayedRows,
            selectedId,
            direction === 'down' ? 1 : -1,
          ),
        )
      })
      .with('activate', () => {
        if (selectedRow) onActivate(selectedRow)
      })
      .with('secondary', () => {
        if (secondaryRow) onActivate(secondaryRow)
      })
      .with('back', onBack)
      .exhaustive()
  }
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        ref={viewportRef}
        data-command-palette="true"
        showCloseButton={false}
        className="inset-0 left-0 top-[var(--palette-viewport-top,0px)] flex h-[var(--palette-viewport-height,100dvh)] max-h-[var(--palette-viewport-height,100dvh)] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 transition-[opacity,transform] data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 motion-reduce:animate-none sm:inset-auto sm:left-1/2 sm:top-[min(16vh,7.5rem)] sm:h-auto sm:max-h-[min(80vh,40rem)] sm:w-[min(40rem,calc(100vw-3rem))] sm:max-w-none sm:-translate-x-1/2 sm:overflow-hidden sm:rounded-xl sm:border sm:shadow-2xl sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95"
        onCloseAutoFocus={onClosed}
        onEscapeKeyDown={(event) => {
          if (event.isComposing) {
            event.preventDefault()
            return
          }
          if (canGoBack) {
            event.preventDefault()
            onBack()
          }
        }}
      >
        <DialogTitle className="sr-only">Search and actions</DialogTitle>
        <DialogDescription className="sr-only">
          Find ENS names, addresses, and actions. Use arrow keys to choose a
          result, Enter to open it, Tab or Right Arrow to show its actions, and
          Escape to go back.
        </DialogDescription>
        <div className="box-content flex h-14 shrink-0 items-center gap-2 border-b pl-3 pr-2 pt-[env(safe-area-inset-top)] sm:h-13 sm:pt-0">
          <HeaderLeading
            canGoBack={canGoBack}
            screen={frame?.screen}
            title={title}
            onBack={() => {
              onBack()
              inputRef.current?.focus()
            }}
          />
          <input
            ref={inputRef}
            autoFocus
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls={aria.listId}
            aria-activedescendant={aria.activeId}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label={placeholder}
            placeholder={placeholder}
            value={frame?.query ?? ''}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            onKeyDown={onKeyDown}
            onPaste={(event) => applyPastedNameSearch(event, onQueryChange)}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <span className="sr-only" role="status">
            {isSearching ? 'Searching…' : ''}
          </span>
          {isSearching && (
            <span
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-border border-t-foreground motion-reduce:animate-none"
            />
          )}
          {frame?.query && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground"
              onClick={() => {
                onQueryChange('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </Button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="shrink-0 rounded-md px-1.5 py-1 text-base text-accent-text outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-1"
          >
            <span className="sm:hidden">Cancel</span>
            <Kbd className="hidden sm:inline-flex">esc</Kbd>
          </button>
        </div>
        {notice && (
          <p
            className="border-b px-4 py-2 text-small text-message-warning-text"
            role="status"
          >
            {notice}
          </p>
        )}
        {error && (
          <div className="flex items-center gap-3 border-b bg-destructive/5 px-4 py-2.5">
            <p
              className="flex-1 text-small text-message-danger-text"
              role="alert"
            >
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}
        {/* Keep the input mounted while resetting cmdk's result store after structural changes. */}
        <Command
          key={listKey}
          shouldFilter={false}
          value={selectedId}
          disablePointerSelection
          className="min-h-0 flex-1 rounded-none bg-transparent"
          aria-label="Search results"
        >
          <CommandList
            ref={listRef}
            data-palette-list={listKey}
            onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
            className="min-h-0 max-h-none flex-1 overflow-y-auto overscroll-contain px-2 pb-2 sm:h-[min(23rem,52vh)] sm:flex-none"
          >
            {groups.map((group) => (
              <PaletteResultGroup
                key={group}
                group={group}
                rows={rows.filter((row) => row.group === group)}
                query={query}
                onActivate={activateAndFocus}
                onSelectionChange={onSelectionChange}
                onClear={() => {
                  onClearHistory()
                  inputRef.current?.focus()
                }}
              />
            ))}
            {!rows.length && (
              <PaletteEmptyState isSearching={isSearching} query={query} />
            )}
          </CommandList>
        </Command>
        <PaletteFooter
          selectedRow={selectedRow}
          secondaryRow={secondaryRow}
          canGoBack={canGoBack}
          onActivate={activateAndFocus}
        />
      </DialogContent>
    </Dialog>
  )
}

const HeaderLeading = ({
  canGoBack,
  screen,
  title,
  onBack,
}: {
  readonly canGoBack: boolean
  readonly screen?: PaletteScreen
  readonly title: string
  readonly onBack: () => void
}) =>
  canGoBack ? (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground"
        onClick={onBack}
        aria-label="Back"
      >
        <ArrowLeft className="size-4" />
      </Button>
      <ScopeChip screen={screen} title={title} />
    </>
  ) : (
    <Search
      className="ml-1 size-4 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
  )

const PaletteResultGroup = ({
  group,
  rows,
  query,
  onActivate,
  onSelectionChange,
  onClear,
}: {
  readonly group: string
  readonly rows: readonly PaletteRow[]
  readonly query: string
  readonly onActivate: (row: PaletteRow) => void
  readonly onSelectionChange: (id: string) => void
  readonly onClear: () => void
}) => {
  const first = rows.at(0)
  return (
    <CommandGroup
      heading={
        <span className="flex items-baseline gap-2 text-smallcaps text-muted-foreground">
          {group}
          {first?.groupDetail && (
            <span className="normal-case tracking-normal text-small text-muted-foreground/70">
              {first.groupDetail}
            </span>
          )}
        </span>
      }
      className="relative p-0 **:[[cmdk-group-heading]]:pt-3"
    >
      {first?.isGroupClearable && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${group.toLowerCase()}`}
          className="absolute right-2 top-2.5 rounded-sm px-1 text-small text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear
        </button>
      )}
      {rows.map((row) => (
        <PaletteResultRow
          key={row.id}
          row={row}
          query={query}
          onActivate={onActivate}
          onSelectionChange={onSelectionChange}
        />
      ))}
    </CommandGroup>
  )
}

const PaletteEmptyState = ({
  isSearching,
  query,
}: {
  readonly isSearching?: boolean
  readonly query: string
}) =>
  isSearching ? (
    <SearchingRows />
  ) : (
    <div className="flex min-h-40 flex-col items-center justify-center gap-1 px-6 py-8 text-center">
      <p className="font-medium">
        {query ? `No names or actions match “${query}”` : 'Nothing to show yet'}
      </p>
      <p className="max-w-xs text-small text-muted-foreground">
        Try a full ENS name, an address, or an action like “renew”.
      </p>
    </div>
  )

const PaletteFooter = ({
  selectedRow,
  secondaryRow,
  canGoBack,
  onActivate,
}: {
  readonly selectedRow?: PaletteRow
  readonly secondaryRow?: PaletteRow
  readonly canGoBack: boolean
  readonly onActivate: (row: PaletteRow) => void
}) => (
  <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-t px-4 text-small text-muted-foreground max-sm:sr-only max-sm:focus-within:not-sr-only">
    <div className="flex min-w-0 items-center gap-4">
      {selectedRow && (
        <span className="flex items-center gap-1.5">
          <Kbd>
            <CornerDownLeft className="size-3" aria-hidden="true" />
          </Kbd>
          {getRowEnterLabel(selectedRow)}
        </span>
      )}
      {secondaryRow?.action.type === 'actions' && (
        <button
          type="button"
          onClick={() => onActivate(secondaryRow)}
          aria-label={`Actions for ${getEntityLabel(secondaryRow.action.entity)}`}
          className="flex items-center gap-1.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Kbd>tab</Kbd>
          Actions
        </button>
      )}
    </div>
    <span className="flex shrink-0 items-center gap-1.5">
      <Kbd>{canGoBack ? '⌫' : '>'}</Kbd>
      {canGoBack ? 'Back' : 'Actions only'}
    </span>
  </div>
)

const Kbd = ({
  children,
  className,
}: {
  readonly children: ReactNode
  readonly className?: string
}) => (
  <kbd
    className={cn(
      'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-b-2 bg-background px-1 font-mono text-[0.6875rem] leading-none text-muted-foreground',
      className,
    )}
  >
    {children}
  </kbd>
)

const EntityMark = ({
  entity,
  variant,
}: {
  readonly entity: PaletteEntity
  readonly variant?: 'address' | 'contract'
}) =>
  entity.type === 'name' ? (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 overflow-hidden rounded-full"
    >
      <NameAvatar
        name={entity.name}
        width="20px"
        height="20px"
        rounded="rounded-full"
        isEnabled={false}
      />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full',
        variant === 'contract' ? 'bg-danger-fill' : 'bg-success-fill',
      )}
    >
      {variant === 'contract' ? (
        <Server className="size-3 text-danger-text" />
      ) : (
        <Wallet className="size-3 text-success-text" />
      )}
    </span>
  )

const ScopeChip = ({
  screen,
  title,
}: {
  readonly screen?: PaletteScreen
  readonly title: string
}) => {
  const entity = screen?.type === 'entity' ? screen.entity : undefined
  return (
    <span
      className={cn(
        'flex h-7 min-w-0 max-w-[50%] shrink-0 items-center gap-1.5 rounded-full pr-2.5 text-small font-medium',
        match(entity?.type)
          .with('name', () => 'bg-accent-fill pl-1 text-accent-text')
          .with('address', () => 'bg-success-fill pl-1 text-success-text')
          .otherwise(() => 'bg-muted pl-2.5 text-foreground'),
      )}
    >
      {entity && <EntityMark entity={entity} />}
      <span data-palette-scope className="truncate" title={title}>
        {entity?.type === 'address' ? truncateAddress(title) : title}
      </span>
    </span>
  )
}

const RowLeading = ({ leading }: { readonly leading: PaletteRowLeading }) => {
  if (leading.type === 'entity')
    return <EntityMark entity={leading.entity} variant={leading.variant} />
  const Icon = ICONS[leading.icon]
  return (
    <span className="flex size-5 shrink-0 items-center justify-center">
      <Icon
        aria-hidden="true"
        className="size-4 text-muted-foreground group-data-[selected=true]/row:text-foreground"
      />
    </span>
  )
}

const RowTitle = ({
  row,
  query,
}: {
  readonly row: PaletteRow
  readonly query: string
}) => {
  if (row.leading.type === 'entity' && row.leading.entity.type === 'address')
    return (
      <span
        className="min-w-0 flex-1 truncate text-entity-base"
        title={row.title}
      >
        <EntityBadge
          variant={row.leading.variant ?? 'address'}
          format="truncate"
        >
          <span aria-hidden="true">{truncateAddress(row.title)}</span>
          <span className="sr-only">{row.title}</span>
        </EntityBadge>
      </span>
    )
  const parts = getTitleParts(row.title, query)
  return (
    <span className="min-w-0 flex-1 truncate" title={row.title}>
      {parts.before}
      {parts.match && (
        <mark className="bg-transparent font-medium text-foreground">
          {parts.match}
        </mark>
      )}
      {parts.after}
    </span>
  )
}

const PaletteResultRow = ({
  row,
  query,
  onActivate,
  onSelectionChange,
}: {
  readonly row: PaletteRow
  readonly query: string
  readonly onActivate: (row: PaletteRow) => void
  readonly onSelectionChange: (id: string) => void
}) => {
  const secondary = getSecondaryRow(row)
  return (
    <CommandItem
      value={row.id}
      onSelect={() => onActivate(row)}
      onPointerMoveCapture={(event) => {
        if (event.pointerType !== 'touch') onSelectionChange(row.id)
      }}
      onPointerDown={() => onSelectionChange(row.id)}
      onClickCapture={(event) => {
        if (
          !secondary ||
          !(event.target instanceof Element) ||
          !event.target.closest('[data-palette-secondary]')
        )
          return
        event.stopPropagation()
        onActivate(secondary)
      }}
      className="group/row h-12 cursor-pointer gap-3 rounded-md px-2 text-base data-[selected=true]:bg-accent sm:h-10 sm:gap-2.5"
    >
      <RowLeading leading={row.leading} />
      <RowTitle row={row} query={query} />
      {row.meta && (
        <span
          className={cn(
            'max-w-[45%] shrink truncate text-small',
            META_TONES[row.meta.tone],
          )}
          title={row.meta.text}
        >
          {row.meta.text}
        </span>
      )}
      {secondary && (
        // Pointer shortcut only; keyboard and screen readers use Tab, → or the footer's Actions button.
        <span
          aria-hidden="true"
          data-palette-secondary
          className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md border bg-background pl-2 pr-1 text-small text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground active:translate-y-px sm:hidden sm:h-6 sm:group-data-[selected=true]/row:inline-flex"
        >
          Actions
          <ChevronRight className="size-3.5 text-current" />
        </span>
      )}
      {row.hasNextStep && (
        <ChevronRight
          aria-hidden="true"
          className="size-4 text-muted-foreground/60"
        />
      )}
      <Kbd className="hidden sm:group-data-[selected=true]/row:inline-flex">
        <CornerDownLeft className="size-3" aria-hidden="true" />
      </Kbd>
    </CommandItem>
  )
}

const SearchingRows = () => (
  <div aria-hidden="true" className="pt-3">
    {['w-40', 'w-28', 'w-36'].map((width) => (
      <div key={width} className="flex h-12 items-center gap-3 px-2 sm:h-10">
        <span className="size-5 shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        <span
          className={cn(
            'h-2.5 animate-pulse rounded-sm bg-muted motion-reduce:animate-none',
            width,
          )}
        />
      </div>
    ))}
  </div>
)

const getKeyboardAction = ({
  key,
  isComposing,
  isShift,
  hasQuery,
  canGoBack,
  hasSecondary,
  isCaretAtEnd,
}: {
  readonly key: string
  readonly isComposing: boolean
  readonly isShift: boolean
  readonly hasQuery: boolean
  readonly canGoBack: boolean
  readonly hasSecondary: boolean
  readonly isCaretAtEnd: boolean
}) => {
  if (isComposing) return 'composition'
  if (key === 'ArrowDown') return 'down'
  if (key === 'ArrowUp') return 'up'
  if (key === 'Enter') return 'activate'
  if (key === 'Tab' && !isShift && hasSecondary) return 'secondary'
  if (key === 'ArrowRight' && hasSecondary && isCaretAtEnd) return 'secondary'
  if (key === 'Backspace' && !hasQuery && canGoBack) return 'back'
  return 'native'
}

// Keeps the keyboard-selected row visible, with its group heading when it is the group's first row.
const revealRow = (list: HTMLElement, id: string) => {
  const row = Array.from(list.querySelectorAll('[cmdk-item]')).find(
    (item) => item.getAttribute('data-value') === id,
  )
  const group = row?.closest('[cmdk-group]')
  if (group?.querySelector('[cmdk-item]') === row)
    group?.querySelector('[cmdk-group-heading]')?.scrollIntoView({
      block: 'nearest',
    })
  row?.scrollIntoView({ block: 'nearest' })
}

const useResultListAria = (
  list: { readonly current: HTMLDivElement | null },
  selectedId: string,
  listKey: string,
) => {
  const [aria, setAria] = useState<{
    readonly listId?: string
    readonly activeId?: string
  }>({})
  useLayoutEffect(() => {
    const element = list.current
    if (element?.dataset.paletteList !== listKey) return
    const selected = Array.from(
      element?.querySelectorAll('[cmdk-item]') ?? [],
    ).find((row) => row.getAttribute('data-value') === selectedId)
    const next = { listId: element?.id, activeId: selected?.id }
    setAria((previous) =>
      previous.listId === next.listId && previous.activeId === next.activeId
        ? previous
        : next,
    )
  }, [list, selectedId, listKey])
  return aria
}
