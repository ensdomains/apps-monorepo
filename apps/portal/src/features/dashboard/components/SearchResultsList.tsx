import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { cn } from '@/lib/utils'
import type { Suggestion } from '../utils/buildSearchSuggestions'

const AVATAR_SIZE = '32px'

const AvatarPlaceholder = ({ isLoading = false }: { isLoading?: boolean }) => (
  <div
    className={cn(
      'shrink-0 rounded-md',
      isLoading
        ? 'bg-muted animate-pulse'
        : '[background:var(--avatar-placeholder-gradient)]',
    )}
    style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
  />
)

const SectionLegend = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => (
  <legend
    className={cn(
      'px-2 py-1.5 text-xs font-medium text-muted-foreground',
      className,
    )}
  >
    {children}
  </legend>
)

type SearchResultsListData = {
  suggestions: Suggestion[]
  ownerBySuggestionId: Map<
    string,
    | { owner: string; registryAddress: string; network: string }
    | null
    | undefined
  >
  availableNames: Suggestion[]
  ownedNamesFiltered: { name: string }[]
}

export type SearchResultsListProps = SearchResultsListData & {
  onSelect: (value: string) => void
  variant: 'command' | 'listbox'
  listboxId?: string
  activeIndex?: number
}

export const SearchResultsList = ({
  suggestions,
  ownerBySuggestionId,
  availableNames,
  ownedNamesFiltered,
  onSelect,
  variant,
  listboxId = '',
  activeIndex = -1,
}: SearchResultsListProps) => {
  const hasSuggestions = suggestions.length > 0
  const hasAvailable = availableNames.length > 0
  const hasOwned = ownedNamesFiltered.length > 0

  const rowContent = (
    avatar: React.ReactNode,
    label: string,
    description?: string,
  ) => (
    <>
      {avatar}
      <div className="flex min-w-0 flex-col items-start gap-0.5 overflow-hidden">
        <span className="font-medium truncate w-full">{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground truncate w-full">{description}</span>
        )}
      </div>
    </>
  )

  const rowClassName = (isActive: boolean) =>
    cn(
      'w-full flex flex-row items-center gap-3 rounded-sm px-2 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-0',
      variant === 'listbox' &&
        (isActive
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-accent hover:text-accent-foreground'),
    )

  const suggestionsStartIdx = 0
  const availableStartIdx = suggestions.length
  const ownedStartIdx = suggestions.length + availableNames.length

  return (
    <>
      {hasSuggestions &&
        (variant === 'command' ? (
          <CommandGroup heading="Suggestions">
            {suggestions.map((suggestion) => {
              const isName = suggestion.id.startsWith('name:')
              const ownerData = isName
                ? ownerBySuggestionId.get(suggestion.id)
                : undefined
              const ownerResolved = ownerData !== undefined
              const hasOwner = ownerData !== null && ownerData !== undefined
              const avatar = isName ? (
                hasOwner ? (
                  <NameAvatar
                    name={suggestion.inputValue}
                    width={AVATAR_SIZE}
                    height={AVATAR_SIZE}
                    rounded="rounded-md"
                  />
                ) : (
                  <AvatarPlaceholder isLoading={!ownerResolved} />
                )
              ) : (
                <AvatarPlaceholder />
              )
              return (
                <CommandItem
                  key={suggestion.id}
                  value={suggestion.id}
                  onSelect={onSelect}
                  className="flex flex-row items-center gap-3 py-2 min-w-0"
                >
                  {rowContent(avatar, suggestion.label, suggestion.description)}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : (
          <fieldset className="border-0 p-0 m-0 min-w-0">
            <SectionLegend>Suggestions</SectionLegend>
            {suggestions.map((suggestion, i) => {
              const idx = suggestionsStartIdx + i
              const isName = suggestion.id.startsWith('name:')
              const ownerData = isName
                ? ownerBySuggestionId.get(suggestion.id)
                : undefined
              const hasOwner = ownerData !== null && ownerData !== undefined
              const avatar = isName ? (
                hasOwner ? (
                  <NameAvatar
                    name={suggestion.inputValue}
                    width={AVATAR_SIZE}
                    height={AVATAR_SIZE}
                    rounded="rounded-md"
                  />
                ) : (
                  <AvatarPlaceholder />
                )
              ) : (
                <AvatarPlaceholder />
              )
              return (
                <button
                  key={suggestion.id}
                  id={listboxId ? `${listboxId}-opt-${idx}` : undefined}
                  type="button"
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={rowClassName(idx === activeIndex)}
                  onClick={() => onSelect(suggestion.id)}
                >
                  {rowContent(avatar, suggestion.label, suggestion.description)}
                </button>
              )
            })}
          </fieldset>
        ))}

      {hasSuggestions &&
        (hasAvailable || hasOwned) &&
        (variant === 'command' ? (
          <CommandSeparator />
        ) : (
          <hr className="my-1 border-border" />
        ))}

      {hasAvailable &&
        (variant === 'command' ? (
          <CommandGroup heading="Available to register">
            {availableNames.map((s) => (
              <CommandItem
                key={`available:${s.inputValue}`}
                value={`available:${s.inputValue}`}
                onSelect={onSelect}
                className="flex flex-row items-center gap-3 py-2 min-w-0"
              >
                {rowContent(
                  <AvatarPlaceholder />,
                  s.inputValue,
                  'Available to register',
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <fieldset className="border-0 p-0 m-0 min-w-0">
            <SectionLegend>Available to register</SectionLegend>
            {availableNames.map((s, i) => {
              const idx = availableStartIdx + i
              return (
                <button
                  key={`available:${s.inputValue}`}
                  id={listboxId ? `${listboxId}-opt-${idx}` : undefined}
                  type="button"
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={rowClassName(idx === activeIndex)}
                  onClick={() => onSelect(`available:${s.inputValue}`)}
                >
                  {rowContent(
                    <AvatarPlaceholder />,
                    s.inputValue,
                    'Available to register',
                  )}
                </button>
              )
            })}
          </fieldset>
        ))}

      {hasAvailable &&
        hasOwned &&
        (variant === 'command' ? (
          <CommandSeparator />
        ) : (
          <hr className="my-1 border-border" />
        ))}

      {hasOwned &&
        (variant === 'command' ? (
          <CommandGroup heading="Names you own">
            {ownedNamesFiltered.map((d) => (
              <CommandItem
                key={`owned:${d.name}`}
                value={`owned:${d.name}`}
                onSelect={onSelect}
                className="flex flex-row items-center gap-3 py-2 min-w-0"
              >
                {rowContent(
                  <NameAvatar
                    name={d.name}
                    width={AVATAR_SIZE}
                    height={AVATAR_SIZE}
                    rounded="rounded-md"
                  />,
                  d.name,
                  'View',
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <fieldset className="border-0 p-0 m-0 min-w-0">
            <SectionLegend>Names you own</SectionLegend>
            {ownedNamesFiltered.map((d, i) => {
              const idx = ownedStartIdx + i
              return (
                <button
                  key={`owned:${d.name}`}
                  id={listboxId ? `${listboxId}-opt-${idx}` : undefined}
                  type="button"
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={rowClassName(idx === activeIndex)}
                  onClick={() => onSelect(`owned:${d.name}`)}
                >
                  {rowContent(
                    <NameAvatar
                      name={d.name}
                      width={AVATAR_SIZE}
                      height={AVATAR_SIZE}
                      rounded="rounded-md"
                    />,
                    d.name,
                    'View',
                  )}
                </button>
              )
            })}
          </fieldset>
        ))}
    </>
  )
}
