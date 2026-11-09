import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { cn } from '@/lib/utils'
import type { Suggestion } from '../utils/buildSearchSuggestions'
import {
  getSearchSuggestionPresentation,
  type SearchNameVerification,
  type SearchOwner,
} from '../utils/searchResultsUtils'

const AVATAR_SIZE = '32px'

const AvatarPlaceholder = ({
  isLoading = false,
}: {
  readonly isLoading?: boolean
}) => (
  <div
    className={cn(
      'shrink-0 rounded-sm',
      isLoading
        ? 'bg-muted animate-pulse'
        : '[background:var(--avatar-placeholder-gradient)]',
    )}
    style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
  />
)

const SearchGroup = ({
  title,
  variant,
  children,
}: {
  readonly title: string
  readonly variant: 'command' | 'listbox'
  readonly children: ReactNode
}) =>
  variant === 'command' ? (
    <CommandGroup heading={title}>{children}</CommandGroup>
  ) : (
    <fieldset className="border-0 p-0 m-0 min-w-0">
      <legend className="px-2 pt-2 pb-2 text-small font-medium text-muted-foreground">
        {title}
      </legend>
      <div className="px-2 pb-2">
        <Separator />
      </div>
      {children}
    </fieldset>
  )

const SearchOption = ({
  value,
  index,
  children,
  variant,
  listboxId,
  activeIndex,
  isDisabled = false,
  onSelect,
}: {
  readonly value: string
  readonly index: number
  readonly children: ReactNode
  readonly variant: 'command' | 'listbox'
  readonly listboxId: string
  readonly activeIndex: number
  readonly isDisabled?: boolean
  readonly onSelect: (value: string) => void
}) =>
  variant === 'command' ? (
    <CommandItem
      value={value}
      onSelect={onSelect}
      disabled={isDisabled}
      className="flex flex-row items-center gap-3 py-2"
    >
      {children}
    </CommandItem>
  ) : (
    <button
      id={listboxId ? `${listboxId}-opt-${index}` : undefined}
      type="button"
      role="option"
      aria-selected={index === activeIndex}
      disabled={isDisabled}
      className={cn(
        'w-full flex flex-row items-center gap-3 rounded-sm px-2 py-1.5 text-left text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        index === activeIndex
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-accent hover:text-accent-foreground',
        isDisabled && 'opacity-50 cursor-default',
      )}
      onClick={() => onSelect(value)}
    >
      {children}
    </button>
  )

const SearchRowContent = ({
  avatar,
  label,
  description,
  isLoading = false,
}: {
  readonly avatar: ReactNode
  readonly label: string
  readonly description?: string
  readonly isLoading?: boolean
}) => (
  <>
    {avatar}
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <span className="font-medium break-all">{label}</span>
      {isLoading ? (
        <Skeleton className="h-3 w-24" />
      ) : (
        description && (
          <span className="text-small text-muted-foreground">
            {description}
          </span>
        )
      )}
    </span>
  </>
)

export type SearchResultsListProps = {
  readonly suggestions: readonly Suggestion[]
  readonly ownerBySuggestionId: ReadonlyMap<
    string,
    SearchOwner | null | undefined
  >
  readonly offchainNameIds: ReadonlySet<string>
  readonly availableNames: readonly Suggestion[]
  readonly pendingAvailabilityIds: ReadonlySet<string>
  readonly ownedNamesFiltered: readonly { readonly name: string }[]
  readonly nameVerificationBySuggestionId?: ReadonlyMap<
    string,
    SearchNameVerification
  >
  readonly onSelect: (value: string) => void
  readonly variant: 'command' | 'listbox'
  readonly listboxId?: string
  readonly activeIndex?: number
}

export const SearchResultsList = ({
  suggestions,
  ownerBySuggestionId,
  offchainNameIds,
  availableNames,
  pendingAvailabilityIds,
  ownedNamesFiltered,
  nameVerificationBySuggestionId,
  onSelect,
  variant,
  listboxId = '',
  activeIndex = -1,
}: SearchResultsListProps) => {
  const availableIds = new Set(availableNames.map(({ id }) => id))
  const optionProps = { variant, listboxId, activeIndex, onSelect }

  return (
    <>
      {suggestions.length > 0 && (
        <SearchGroup title="Suggestions" variant={variant}>
          {suggestions.map((suggestion, index) => {
            const presentation = getSearchSuggestionPresentation({
              suggestion,
              owner: ownerBySuggestionId.get(suggestion.id),
              isOffchain: offchainNameIds.has(suggestion.id),
              isAvailable: availableIds.has(suggestion.id),
              isPendingAvailability: pendingAvailabilityIds.has(suggestion.id),
              verification: nameVerificationBySuggestionId?.get(suggestion.id),
            })
            return (
              <SearchOption
                key={suggestion.id}
                {...optionProps}
                value={suggestion.id}
                index={index}
                isDisabled={presentation.isDisabled}
              >
                <SearchRowContent
                  avatar={
                    presentation.hasAvatar ? (
                      <NameAvatar
                        name={suggestion.inputValue}
                        width={AVATAR_SIZE}
                        height={AVATAR_SIZE}
                        rounded="rounded-sm"
                      />
                    ) : (
                      <AvatarPlaceholder isLoading={presentation.isLoading} />
                    )
                  }
                  label={suggestion.label}
                  description={presentation.description}
                  isLoading={presentation.isLoading}
                />
              </SearchOption>
            )
          })}
        </SearchGroup>
      )}
      {availableNames.length > 0 && (
        <SearchGroup title="Register a name" variant={variant}>
          {availableNames.map((suggestion, index) => (
            <SearchOption
              key={`register:${suggestion.inputValue}`}
              {...optionProps}
              value={`register:${suggestion.inputValue}`}
              index={suggestions.length + index}
            >
              <SearchRowContent
                avatar={
                  <ArrowUpRight className="size-5 shrink-0 text-primary" />
                }
                label={`Register ${suggestion.inputValue}`}
                description="Open registration"
              />
            </SearchOption>
          ))}
        </SearchGroup>
      )}
      {ownedNamesFiltered.length > 0 && (
        <SearchGroup title="Names you own" variant={variant}>
          {ownedNamesFiltered.map(({ name }, index) => (
            <SearchOption
              key={`owned:${name}`}
              {...optionProps}
              value={`owned:${name}`}
              index={suggestions.length + availableNames.length + index}
            >
              <SearchRowContent
                avatar={
                  <NameAvatar
                    name={name}
                    width={AVATAR_SIZE}
                    height={AVATAR_SIZE}
                    rounded="rounded-sm"
                  />
                }
                label={name}
                description="View"
              />
            </SearchOption>
          ))}
        </SearchGroup>
      )}
    </>
  )
}
