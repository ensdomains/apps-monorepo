import type { Column, Table } from '@tanstack/react-table'
import { ChevronDown, SlidersHorizontal, XIcon } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { DateRangeFilterFields } from '@/components/table/TableDateRangeFilter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { toggleValue } from '@/utils/filtering/multiSelectFilter'
import {
  type DateRange,
  getDateRangeLabel,
} from '@/utils/formatting/formatDateRange'
import { type NameFilter, nameFilterConfig } from './NamesFilters.config'
import type { NameRow } from './NamesTable/columns'

type V2RolesState = 'ready' | 'loading' | 'unavailable'

// TanStack exposes filter values as unknown. Narrow them at the UI boundary.
const selectedValues = (column: Column<NameRow> | undefined): string[] => {
  const value = column?.getFilterValue()
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

const expiryRange = (value: unknown): DateRange => {
  if (!value || typeof value !== 'object') return {}
  return {
    from:
      'from' in value && value.from instanceof Date ? value.from : undefined,
    to: 'to' in value && value.to instanceof Date ? value.to : undefined,
  }
}

const selectionLabel = (
  filter: NameFilter,
  selected: readonly string[],
): string =>
  filter.groups
    .flatMap((group) => group.options)
    .filter((option) => selected.includes(option.value))
    .map((option) => option.label)
    .join(', ')

const FilterSection = ({
  label,
  summary,
  children,
}: {
  readonly label: string
  readonly summary: string
  readonly children: ReactNode
}) => (
  <details className="group/filter">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-small font-medium [&::-webkit-details-marker]:hidden">
      {label}
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <span className="max-w-40 truncate">{summary}</span>
        <ChevronDown className="size-4 shrink-0 group-open/filter:rotate-180" />
      </span>
    </summary>
    <div className="space-y-4 px-4 pb-4">{children}</div>
  </details>
)

/** Mounted with the panel, so faceting does no work while filters are closed. */
const NameFilterSection = ({
  table,
  filter,
  v2RolesState,
}: {
  readonly table: Table<NameRow>
  readonly filter: NameFilter
  readonly v2RolesState: V2RolesState
}) => {
  const id = useId()
  const [search, setSearch] = useState('')
  const column = table.getColumn(filter.key)
  const selected = selectedValues(column)
  const counts = column?.getFacetedUniqueValues()
  const isRolesFilter = filter.key === 'roles'
  const needle = search.trim().toLowerCase()
  const groups = filter.groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) =>
        option.label.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.options.length > 0)

  return (
    <FilterSection
      label={filter.label}
      summary={selectionLabel(filter, selected) || 'All'}
    >
      {isRolesFilter && (
        <>
          <Input
            aria-label="Search roles"
            placeholder="Search roles..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {v2RolesState !== 'ready' && (
            <p role="status" className="text-small text-muted-foreground">
              {v2RolesState === 'loading'
                ? 'Loading ENSv2 roles…'
                : 'ENSv2 roles are unavailable. V1 relationships can still be filtered.'}
            </p>
          )}
        </>
      )}
      {groups.map((group) => (
        <fieldset key={group.title} className="space-y-2">
          <legend className="mb-2 text-small text-muted-foreground">
            {group.title}
          </legend>
          {group.options.map((option) => {
            const optionId = `${id}-${option.value}`
            const isUnavailable =
              option.value.startsWith('v2:') && v2RolesState !== 'ready'
            const count = isUnavailable
              ? undefined
              : (counts?.get(option.value) ?? 0)
            return (
              <div key={option.value} className="flex items-center gap-3">
                <Checkbox
                  id={optionId}
                  checked={selected.includes(option.value)}
                  disabled={isUnavailable}
                  aria-describedby={`${optionId}-count`}
                  onCheckedChange={() =>
                    column?.setFilterValue(toggleValue(selected, option.value))
                  }
                />
                <Label
                  htmlFor={optionId}
                  className="flex-1 cursor-pointer py-1"
                >
                  {option.label}
                </Label>
                <span
                  id={`${optionId}-count`}
                  className="text-small tabular-nums text-muted-foreground"
                >
                  {count === undefined ? (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Count unavailable</span>
                    </>
                  ) : (
                    <>
                      {count}
                      <span className="sr-only"> matching names</span>
                    </>
                  )}
                </span>
              </div>
            )
          })}
        </fieldset>
      ))}
    </FilterSection>
  )
}

export const NamesFilters = ({
  table,
  v2RolesState,
}: {
  readonly table: Table<NameRow>
  readonly v2RolesState: V2RolesState
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const expiryColumn = table.getColumn('expiryDate')
  const expiry = expiryRange(expiryColumn?.getFilterValue())
  const active = nameFilterConfig.flatMap((filter) => {
    const selected = selectedValues(table.getColumn(filter.key))
    return selected.length
      ? [{ ...filter, selected, labelText: selectionLabel(filter, selected) }]
      : []
  })
  const hasExpiry = !!(expiry.from || expiry.to)
  const count = active.length + Number(hasExpiry)
  const hasV2Selection = selectedValues(table.getColumn('roles')).some((role) =>
    role.startsWith('v2:'),
  )
  const clearFilters = () =>
    table.setColumnFilters((filters) =>
      filters.filter((filter) => filter.id === 'name'),
    )

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="shrink-0"
            aria-label={count ? `Filters, ${count} active` : 'Filters'}
          >
            <SlidersHorizontal className="size-4" />
            Filters{count > 0 && <Badge>{count}</Badge>}
          </Button>
        </PopoverTrigger>
        {/* Preserve 1rem gutters when w-80 exceeds the width of a narrow viewport. */}
        <PopoverContent
          align="end"
          aria-label="Name filters"
          className="w-80 max-w-[calc(100vw-2rem)] max-h-(--radix-popover-content-available-height) flex flex-col overflow-hidden p-0"
        >
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">Filters</h3>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear all
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close filters"
                onClick={() => setIsOpen(false)}
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>
          <div className="min-h-0 divide-y overflow-y-auto">
            {nameFilterConfig.map((filter) => (
              <NameFilterSection
                key={filter.key}
                table={table}
                filter={filter}
                v2RolesState={v2RolesState}
              />
            ))}
            <FilterSection label="Expiry" summary={getDateRangeLabel(expiry)}>
              <DateRangeFilterFields
                dateRange={expiry}
                onChange={(range) => expiryColumn?.setFilterValue(range)}
              />
            </FilterSection>
          </div>
        </PopoverContent>
      </Popover>
      {v2RolesState !== 'ready' && hasV2Selection && (
        <p
          role="status"
          className="basis-full text-small text-muted-foreground"
        >
          {v2RolesState === 'loading'
            ? 'Loading ENSv2 role matches…'
            : 'ENSv2 role matches could not be loaded.'}
        </p>
      )}
      {count > 0 && (
        <div className="flex basis-full flex-wrap items-center gap-2">
          {active.map((filter) => (
            <Button
              key={filter.key}
              variant="secondary"
              size="sm"
              className="h-auto min-w-0 max-w-full whitespace-normal py-1 text-left"
              aria-label={`Remove ${filter.label.toLowerCase()} filter`}
              onClick={() =>
                table.getColumn(filter.key)?.setFilterValue(undefined)
              }
            >
              {filter.label}: {filter.labelText}
              <XIcon className="size-3 shrink-0" />
            </Button>
          ))}
          {hasExpiry && (
            <Button
              variant="secondary"
              size="sm"
              className="h-auto max-w-full whitespace-normal py-1 text-left"
              aria-label="Remove expiry filter"
              onClick={() => expiryColumn?.setFilterValue(undefined)}
            >
              Expiry: {getDateRangeLabel(expiry)}
              <XIcon className="size-3 shrink-0" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        </div>
      )}
    </>
  )
}
