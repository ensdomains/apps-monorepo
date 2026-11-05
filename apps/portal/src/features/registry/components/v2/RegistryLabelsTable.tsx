import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ListLoader } from '@/components/ListLoader/ListLoader'
import {
  infiniteFetchMore,
  useListLoader,
} from '@/components/ListLoader/useListLoader'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { SortButton } from '@/components/table/SortButton'
import { useEarliestExpiry } from '@/features/profile/hooks/useEarliestExpiry'
import { formatExpiryDuration } from '@/utils/formatting/formatDateTime'
import {
  type AddressNameItem,
  getResolvingExpiry,
} from '@/utils/names/addressNames'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'
import { getRegistryInfoQueryOptions } from '../../hooks/useRegistry'
import {
  getRegistryLabelsQueryOptions,
  REGISTRY_LABELS_PAGE_SIZE,
  type RegistryLabelRow,
} from '../../hooks/useRegistryLabels'
import { getNamesAbove } from '../../utils/subnameExpiry'

// Figma: three narrow columns, the labelhash takes the rest and wraps.
const LABEL_COLUMN_WIDTH = 140
const EXPIRY_COLUMN_WIDTH = 170

type LabelRow = RegistryLabelRow & Pick<AddressNameItem, 'parentExpiryDate'>

const toDuration = (date: Date) =>
  formatExpiryDuration(
    unixSecondsToPlainDateUtc(Math.floor(date.getTime() / 1000)),
  )

/** A label's own expiry, or its parent's when the label stops resolving with it. */
const LabelExpiry = ({
  expiryDate,
  parentExpiryDate,
}: Pick<LabelRow, 'expiryDate' | 'parentExpiryDate'>) => {
  const ownDate =
    expiryDate === null ? null : new Date(Number(expiryDate) * 1000)
  const resolving = getResolvingExpiry({
    expiryDate: ownDate,
    parentExpiryDate,
  })
  const shown = match(resolving)
    .with({ type: 'none' }, () => 'Never')
    .with({ type: 'parent', date: P.instanceOf(Date) }, ({ date }) =>
      toDuration(date),
    )
    .with({ type: 'parent' }, () => 'With its parent')
    .otherwise(() => (ownDate ? toDuration(ownDate) : 'Never'))
  const note = match(resolving)
    .with({ type: 'parent', date: P.instanceOf(Date) }, () => 'With its parent')
    .with({ type: 'parentFirst' }, ({ date }) => {
      const left = toDuration(date)
      return left === 'Expired'
        ? 'Stopped resolving with its parent'
        : `Stops resolving with its parent in ${left}`
    })
    .otherwise(() => null)

  return (
    <span className="flex flex-col gap-0.5 text-muted-foreground">
      <span>{shown}</span>
      {note && <span className="text-small whitespace-normal">{note}</span>}
    </span>
  )
}

const columns: ColumnDef<LabelRow>[] = [
  {
    id: 'label',
    meta: { width: LABEL_COLUMN_WIDTH },
    accessorFn: (row) => row.labelName ?? row.name ?? row.labelhash ?? '',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Label
      </SortButton>
    ),
    cell: ({ row }) => {
      const { name, labelName, labelhash } = row.original
      return (
        <span
          className="inline-block max-w-full truncate rounded-sm bg-foreground px-1.5 py-1 align-middle font-medium text-background"
          title={labelhash ?? undefined}
        >
          {labelName ?? name ?? 'label unknown'}
        </span>
      )
    },
  },
  {
    accessorKey: 'expiryDate',
    meta: { width: EXPIRY_COLUMN_WIDTH },
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Expires in
      </SortButton>
    ),
    cell: ({ row }) => <LabelExpiry {...row.original} />,
  },
  {
    accessorKey: 'roleHoldersCount',
    meta: { width: LABEL_COLUMN_WIDTH },
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Roles holders
      </SortButton>
    ),
    cell: ({ row }) => {
      const count = row.original.roleHoldersCount
      return <span className="text-muted-foreground">{count ?? '—'}</span>
    },
  },
  {
    accessorKey: 'labelhash',
    enableSorting: false,
    header: 'Labelhash',
    cell: ({ row }) => (
      <span className="break-all font-mono text-muted-foreground">
        {row.original.labelhash}
      </span>
    ),
  },
]

export const RegistryLabelsTable = ({ address }: { address: Address }) => {
  const {
    data,
    isLoading,
    error,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery(getRegistryLabelsQueryOptions({ address }))

  const labels = data?.pages.flatMap((page) => page.labels) ?? []
  // Every label here lapses with the registry's own name and the names above it.
  const { data: registry } = useQuery(getRegistryInfoQueryOptions({ address }))
  const namesAbove = registry?.name.endsWith('.eth')
    ? getNamesAbove(registry.name)
    : []
  const { earliestExpiry } = useEarliestExpiry(namesAbove)
  const parentExpiryDate = namesAbove.length > 0 ? earliestExpiry : undefined

  const loader = useListLoader({
    initialCount: REGISTRY_LABELS_PAGE_SIZE,
    loaded: labels.length,
    total: data?.pages.at(-1)?.totalCount,
    hasMore: hasNextPage,
    fetchMore: infiniteFetchMore(fetchNextPage, (page) => page.labels.length),
    resetKey: address,
  })

  if (isLoading) return <LoadingSpinner title="Loading labels..." />

  if (error && !isFetchNextPageError) {
    return (
      <ErrorMessage
        compact
        description="Error fetching labels. Please refresh the page."
      />
    )
  }

  if (labels.length === 0)
    return (
      <NoResultsMessage
        title="No labels yet"
        description="Labels registered in this registry will appear here."
        className="mx-0"
      />
    )

  return (
    <>
      <DataTable
        columns={columns}
        data={labels
          .slice(0, loader.shown)
          .map((label) => ({ ...label, parentExpiryDate }))}
      />
      <ListLoader {...loader} />
    </>
  )
}
