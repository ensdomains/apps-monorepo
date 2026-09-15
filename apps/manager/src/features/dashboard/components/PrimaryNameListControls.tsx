import { Trans, useLingui } from '@lingui/react/macro'
import { Search } from 'lucide-react'
import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { DashboardPagination } from './DashboardPagination'

export const PrimaryNameSearch = ({
  value,
  onChange,
  disabled,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly disabled: boolean
}) => {
  const { t } = useLingui()
  const searchId = useId()
  return (
    <Input
      aria-label={t`Search names`}
      autoComplete="off"
      className="h-11 font-sans"
      disabled={disabled}
      id={searchId}
      onChange={(event) => onChange(event.target.value)}
      placeholder={t`Search names`}
      startIcon={<Search aria-hidden="true" className="size-4" />}
      type="search"
      value={value}
    />
  )
}

export const PrimaryNameListFooter = ({
  pagination,
  selectedName,
  disabled,
}: {
  readonly pagination: {
    readonly currentPage: number
    readonly totalPages: number
    readonly rangeStart: number
    readonly rangeEnd: number
    readonly total: number
    readonly onPageChange: (page: number) => void
  }
  readonly selectedName: string | null
  readonly disabled: boolean
}) => (
  <div className="flex shrink-0 flex-col gap-2">
    <DashboardPagination {...pagination} compact disabled={disabled} />
    <div
      aria-live="polite"
      className="min-h-5 break-all font-sans text-muted-foreground text-sm"
    >
      {selectedName && <Trans>Selected: {selectedName}</Trans>}
    </div>
  </div>
)
