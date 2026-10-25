import { ChevronDown, SlidersHorizontal, XIcon } from 'lucide-react'
import { useId, useState } from 'react'
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
import { formatRoleLabel } from '@/lib/roles/formatRoleLabel'
import { isAdminRole } from '@/lib/roles/permissions'
import { REGISTRY_ROLE_ORDER } from '@/lib/roles/registryPowerRoles'
import {
  type FilterGroup,
  toggleValue,
} from '@/utils/filtering/multiSelectFilter'
import {
  type DateRange,
  getDateRangeLabel,
} from '@/utils/formatting/formatDateRange'

const STATUS_FILTER_GROUPS: FilterGroup[] = [
  {
    title: 'Active',
    options: [
      { label: 'Registered', value: 'registered' },
      { label: 'Expires with parent', value: 'expires-with-parent' },
      { label: 'Does not expire', value: 'no-expiry' },
    ],
  },
  {
    title: 'Expired',
    options: [
      { label: 'Expired', value: 'expired' },
      { label: 'Grace', value: 'grace' },
      { label: 'Price cooldown', value: 'premium' },
    ],
  },
]

const LENGTH_FILTER_GROUPS: FilterGroup[] = [
  {
    title: 'Name Length',
    options: [
      { label: '3 characters', value: '3' },
      { label: '4 characters', value: '4' },
      { label: '5+ characters', value: '5+' },
    ],
  },
]

const LEVEL_FILTER_GROUPS: FilterGroup[] = [
  {
    title: 'Name level',
    options: [
      { label: '2LDs', value: '2ld' },
      { label: 'Subnames (3LD+)', value: 'subname' },
    ],
  },
]

const ROLE_FILTER_GROUPS: FilterGroup[] = [
  {
    title: 'ENSv1 relationships',
    options: [
      { label: 'Owner', value: 'owner' },
      { label: 'Manager', value: 'manager' },
    ],
  },

  ...[false, true].map((admin) => ({
    title: admin ? 'ENSv2 admin roles' : 'ENSv2 roles',
    options: REGISTRY_ROLE_ORDER.filter(
      (role) => isAdminRole(role) === admin,
    ).map((role) => ({
      label: `${formatRoleLabel(role)}${admin ? ' (admin)' : ''}`,
      value: `v2:${role}`,
    })),
  })),
]

export type NamesFilterValues = {
  levels: string[]
  roles: string[]
  statuses: string[]
  lengths: string[]
  expiry: DateRange
}

export const EMPTY_NAMES_FILTERS: NamesFilterValues = {
  levels: [],
  roles: [],
  statuses: [],
  lengths: [],
  expiry: {},
}

const FILTERS = [
  { key: 'levels', label: 'Level', groups: LEVEL_FILTER_GROUPS },
  {
    key: 'roles',
    label: 'Roles',
    groups: ROLE_FILTER_GROUPS,
  },
  { key: 'statuses', label: 'Status', groups: STATUS_FILTER_GROUPS },
  { key: 'lengths', label: 'Length', groups: LENGTH_FILTER_GROUPS },
] as const

export const NamesFilters = ({
  value,
  onChange,
  v2RolesState,
}: {
  readonly value: NamesFilterValues
  readonly onChange: (value: NamesFilterValues) => void
  readonly v2RolesState: 'ready' | 'loading' | 'unavailable'
}) => {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [roleSearch, setRoleSearch] = useState('')
  const active = FILTERS.filter(({ key }) => value[key].length > 0)
  const hasExpiry = !!(value.expiry.from || value.expiry.to)
  const count = active.length + Number(hasExpiry)
  const selectionLabel = (
    key: (typeof FILTERS)[number]['key'],
    groups: readonly FilterGroup[],
  ) =>
    groups
      .flatMap((group) => group.options)
      .filter((option) => value[key].includes(option.value))
      .map((option) => option.label)
      .join(', ')

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="shrink-0"
            aria-label={count ? `Filters, ${count} active` : 'Filters'}
          >
            <SlidersHorizontal className="size-4" />
            Filters
            {count > 0 && <Badge>{count}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 max-w-[calc(100vw-2rem)] max-h-(--radix-popover-content-available-height) flex flex-col overflow-hidden p-0"
          aria-label="Name filters"
        >
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">Filters</h3>
            <div className="flex items-center gap-1">
              {v2RolesState !== 'ready' &&
                value.roles.some((role) => role.startsWith('v2:')) && (
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(EMPTY_NAMES_FILTERS)}
                >
                  Clear all
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close filters"
                onClick={() => setOpen(false)}
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>
          <div className="min-h-0 divide-y overflow-y-auto">
            {FILTERS.map(({ key, label, groups }) => (
              <details key={key} className="group/filter">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-small font-medium [&::-webkit-details-marker]:hidden">
                  {label}
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <span className="max-w-40 truncate">
                      {selectionLabel(key, groups) || 'All'}
                    </span>
                    <ChevronDown className="size-4 shrink-0 group-open/filter:rotate-180" />
                  </span>
                </summary>
                <div className="space-y-4 px-4 pb-4">
                  {key === 'roles' && (
                    <>
                      <Input
                        aria-label="Search roles"
                        placeholder="Search roles..."
                        value={roleSearch}
                        onChange={(event) => setRoleSearch(event.target.value)}
                      />
                      {v2RolesState !== 'ready' && (
                        <p
                          role="status"
                          className="text-small text-muted-foreground"
                        >
                          {v2RolesState === 'loading'
                            ? 'Loading ENSv2 roles…'
                            : 'ENSv2 roles are unavailable. V1 relationships can still be filtered.'}
                        </p>
                      )}
                    </>
                  )}
                  {groups
                    .map((group) => ({
                      ...group,
                      options: group.options.filter(
                        (option) =>
                          key !== 'roles' ||
                          option.label
                            .toLowerCase()
                            .includes(roleSearch.trim().toLowerCase()),
                      ),
                    }))
                    .filter((group) => group.options.length > 0)
                    .map((group) => (
                      <fieldset key={group.title} className="space-y-2">
                        <legend className="mb-2 text-small text-muted-foreground">
                          {group.title}
                        </legend>
                        {group.options.map((option) => (
                          <div
                            key={option.value}
                            className="flex items-center gap-3"
                          >
                            <Checkbox
                              id={`${id}-${key}-${option.value}`}
                              checked={value[key].includes(option.value)}
                              disabled={
                                option.value.startsWith('v2:') &&
                                v2RolesState !== 'ready'
                              }
                              onCheckedChange={() =>
                                onChange({
                                  ...value,
                                  [key]: toggleValue(value[key], option.value),
                                })
                              }
                            />
                            <Label
                              htmlFor={`${id}-${key}-${option.value}`}
                              className="flex-1 cursor-pointer py-1"
                            >
                              {option.label}
                            </Label>
                          </div>
                        ))}
                      </fieldset>
                    ))}
                </div>
              </details>
            ))}
            <details className="group/filter">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-small font-medium [&::-webkit-details-marker]:hidden">
                Expiry
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <span className="truncate">
                    {getDateRangeLabel(value.expiry)}
                  </span>
                  <ChevronDown className="size-4 shrink-0 group-open/filter:rotate-180" />
                </span>
              </summary>
              <div className="px-4 pb-4">
                <DateRangeFilterFields
                  dateRange={value.expiry}
                  onChange={(expiry) => onChange({ ...value, expiry })}
                />
              </div>
            </details>
          </div>
        </PopoverContent>
      </Popover>
      {count > 0 && (
        <div className="flex basis-full flex-wrap items-center gap-2">
          {active.map(({ key, label, groups }) => (
            <Button
              key={key}
              variant="secondary"
              size="sm"
              className="h-auto min-w-0 max-w-full whitespace-normal py-1 text-left"
              aria-label={`Remove ${label.toLowerCase()} filter`}
              onClick={() => onChange({ ...value, [key]: [] })}
            >
              {label}: {selectionLabel(key, groups)}
              <XIcon className="size-3 shrink-0" />
            </Button>
          ))}
          {hasExpiry && (
            <Button
              variant="secondary"
              size="sm"
              className="h-auto max-w-full whitespace-normal py-1 text-left"
              aria-label="Remove expiry filter"
              onClick={() => onChange({ ...value, expiry: {} })}
            >
              Expiry: {getDateRangeLabel(value.expiry)}
              <XIcon className="size-3 shrink-0" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(EMPTY_NAMES_FILTERS)}
          >
            Clear all
          </Button>
        </div>
      )}
    </>
  )
}
