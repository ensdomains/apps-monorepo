import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { useLingui } from '@lingui/react/macro'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import type { RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import { checksumAddress, isAddress } from 'viem'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { Input } from '@/components/ui/input'
import {
  formatDashboardDate,
  toDateFromSeconds,
} from '@/features/dashboard/utils'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { getDomainsQuery } from '../service/queries/getDashboardDomains'

type Suggestion = {
  id: string
  label: string
  description: string
  value: string
  avatarRecord?: string | null
}

const useCloseOnOutsideClick = ({
  containerRef,
  enabled,
  onClose,
}: {
  containerRef: RefObject<HTMLElement | null>
  enabled: boolean
  onClose: () => void
}) => {
  useEffect(() => {
    if (!enabled) return

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!containerRef.current || !target) return
      if (!containerRef.current.contains(target)) onClose()
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [containerRef, enabled, onClose])
}

const normalizeSearchTarget = (value: string) => {
  const trimmed = value.trim()

  if (!trimmed) return undefined
  if (isAddress(trimmed, { strict: false })) return trimmed

  const normalizedName = trimmed.includes('.') ? trimmed : `${trimmed}.eth`
  return normalizedName.toLowerCase()
}

export const DashboardSidebarSearch = ({
  onSelect,
}: {
  onSelect?: (value: string) => void
}) => {
  const { t } = useLingui()
  const navigate = useNavigate({ from: '/dashboard' })
  const containerRef = useRef<HTMLDivElement>(null)
  const [searchValue, setSearchValue] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const normalizedInput = searchValue.trim()
  const isAddressInput = isAddress(normalizedInput, { strict: false })

  const { data: searchData } = useQuery(
    getDomainsQuery(
      normalizedInput && !isAddressInput
        ? {
            where: { name_contains_nocase: normalizedInput.toLowerCase() },
            first: 5,
            orderBy: Domain_OrderBy.Name,
            orderDirection: OrderDirection.Asc,
          }
        : undefined,
    ),
  )

  const suggestions = useMemo<Suggestion[]>(() => {
    const items: Suggestion[] = []

    if (!normalizedInput) return items

    const addSuggestion = (suggestion: Suggestion) => {
      if (items.some((item) => item.value === suggestion.value)) return
      items.push(suggestion)
    }

    if (isAddressInput) {
      try {
        const checksummed = checksumAddress(normalizedInput as Address)
        addSuggestion({
          id: `address:${checksummed}`,
          label: checksummed,
          description: t`Address profile`,
          value: checksummed,
        })
      } catch {
        // ignore invalid checksum
      }
    }

    const normalizedName = normalizedInput.includes('.')
      ? normalizedInput
      : `${normalizedInput}.eth`
    const loweredName = normalizedName.toLowerCase()

    for (const domain of searchData?.domains ?? []) {
      const label = domain.normalizedName ?? domain.name
      if (!label) continue

      addSuggestion({
        id: `domain:${domain.id}`,
        label,
        description: t`Registered ${formatDashboardDate(
          toDateFromSeconds(domain.createdAt),
        )}`,
        value: label.toLowerCase(),
        avatarRecord: domain.resolver?.avatar ?? null,
      })
    }

    if (!isAddressInput) {
      addSuggestion({
        id: `name:${loweredName}`,
        label: loweredName,
        description: t`Go to ENS name profile`,
        value: loweredName,
      })
    }

    return items
  }, [isAddressInput, normalizedInput, searchData, t])

  const handleSuggestionSelect = useCallback(
    (value: string) => {
      setIsDropdownOpen(false)

      if (onSelect) {
        onSelect(value)
        return
      }

      navigate({
        to: '/p/$name',
        params: { name: value },
      })
    },
    [navigate, onSelect],
  )

  const handleSearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const target = normalizeSearchTarget(searchValue) ?? suggestions[0]?.value

      if (!target) return

      handleSuggestionSelect(target)
    },
    [handleSuggestionSelect, searchValue, suggestions],
  )

  const closeSuggestions = useCallback(() => {
    setIsDropdownOpen(false)
  }, [])

  const shouldShowSuggestions = isDropdownOpen && suggestions.length > 0

  const avatarQueries = useQueries({
    queries: suggestions.map((suggestion) =>
      parseAvatarQuery(suggestion.avatarRecord ?? undefined),
    ),
  })

  useCloseOnOutsideClick({
    containerRef,
    enabled: shouldShowSuggestions,
    onClose: closeSuggestions,
  })

  return (
    <div className="relative" ref={containerRef}>
      <form onSubmit={handleSearchSubmit}>
        <Input
          autoComplete="off"
          className="h-[44px] rounded-[4px] border-[0.4px] border-ens-gray-two bg-white text-muted-foreground placeholder:text-muted-foreground"
          onChange={(event) => {
            setSearchValue(event.target.value)
            setIsDropdownOpen(true)
          }}
          onFocus={() => setIsDropdownOpen(true)}
          placeholder={t`Search name, address...`}
          size="default"
          startIcon={<Search className="size-[18px] text-muted-foreground" />}
          value={searchValue}
        />
      </form>
      {shouldShowSuggestions && (
        <div className="absolute z-10 mt-2 w-full rounded-md border border-slate-200 bg-white shadow-md">
          <ul className="divide-y divide-slate-100">
            {suggestions.map((suggestion, index) => {
              const avatarUrl =
                avatarQueries[index]?.data ??
                suggestion.avatarRecord ??
                undefined

              return (
                <li key={suggestion.id}>
                  <button
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition hover:bg-slate-50"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      handleSuggestionSelect(suggestion.value)
                    }}
                    type="button"
                  >
                    <div className="flex w-full items-center gap-3">
                      <div className="relative size-8 overflow-hidden rounded-full bg-slate-100">
                        <ImageFallback.Root className="contents">
                          <ImageFallback.Image
                            alt={t`${suggestion.label} avatar`}
                            className="size-full object-cover"
                            src={avatarUrl}
                          />
                          <ImageFallback.Fallback>
                            <img
                              alt={t`${suggestion.label} avatar placeholder`}
                              className="size-full object-cover"
                              src={placeholderAvatar}
                            />
                          </ImageFallback.Fallback>
                        </ImageFallback.Root>
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium text-slate-900 text-sm">
                          {suggestion.label}
                        </span>
                        <span className="text-slate-600 text-xs">
                          {suggestion.description}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
