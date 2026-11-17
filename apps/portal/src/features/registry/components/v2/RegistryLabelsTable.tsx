import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ListLoader } from '@/components/ListLoader/ListLoader'
import {
  infiniteFetchMore,
  useListLoader,
} from '@/components/ListLoader/useListLoader'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { SortButton } from '@/components/table/SortButton'
import {
  ExpiresWith,
  formatExpiry,
} from '@/features/names/components/NameExpiry'
import { useFirstToExpire } from '@/features/profile/hooks/useFirstToExpire'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import {
  type AddressNameItem,
  getNamesAbove,
  getResolvingExpiry,
  getShownExpiry,
} from '@/utils/names/addressNames'
import { getRegistryInfoQueryOptions } from '../../hooks/useRegistry'
import {
  getRegistryLabelsQueryOptions,
  REGISTRY_LABELS_PAGE_SIZE,
  type RegistryLabelRow,
} from '../../hooks/useRegistryLabels'

// Figma: the labelhash is shortened so the expiry takes the rest.
const LABEL_COLUMN_WIDTH = 140
const LABELHASH_COLUMN_WIDTH = 160

type LabelRow = RegistryLabelRow &
  Pick<AddressNameItem, 'parentExpiryDate' | 'parentExpiryName'>

const toResolvingInput = ({
  expiryDate,
  parentExpiryDate,
  parentExpiryName,
}: Pick<LabelRow, 'expiryDate' | 'parentExpiryDate' | 'parentExpiryName'>) => ({
  expiryDate: expiryDate === null ? null : new Date(Number(expiryDate) * 1000),
  parentExpiryDate,
  parentExpiryName,
})

/** A label's expiry, or the first name above it to expire, named. */
const LabelExpiry = (row: LabelRow) => (
  <span className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
    {match(getResolvingExpiry(toResolvingInput(row)))
      .with({ type: 'own' }, ({ date }) => formatExpiry(date))
      .with({ type: 'parent' }, ({ date, name }) => (
        <>
          <span className="whitespace-nowrap">{formatExpiry(date)}</span>{' '}
          <ExpiresWith name={name} />
        </>
      ))
      .with({ type: 'unread' }, () => 'Expires with parent')
      .with({ type: 'none' }, () => 'Never')
      .exhaustive()}
  </span>
)

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
    id: 'expiryDate',
    // Sorts by the date shown; one that never expires goes last.
    accessorFn: (row) =>
      getShownExpiry(toResolvingInput(row))?.getTime() ??
      Number.POSITIVE_INFINITY,
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Expiration
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
    meta: { width: LABELHASH_COLUMN_WIDTH },
    enableSorting: false,
    header: 'Labelhash',
    cell: ({ row }) => {
      const { labelhash } = row.original
      return labelhash ? (
        <EntityBadge
          variant="default"
          type="content"
          copyValue={labelhash}
          compact
        >
          {truncateAddress(labelhash, 6, 4)}
        </EntityBadge>
      ) : null
    },
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
  const registryQuery = useQuery(getRegistryInfoQueryOptions({ address }))
  const namesAbove = registryQuery.data?.name.endsWith('.eth')
    ? getNamesAbove(registryQuery.data.name)
    : []
  const ancestorExpiry = useFirstToExpire(namesAbove)
  const parentExpiry =
    namesAbove.length > 0
      ? {
          parentExpiryDate: ancestorExpiry.firstToExpire?.date ?? null,
          parentExpiryName: ancestorExpiry.firstToExpire?.name,
        }
      : {}

  const loader = useListLoader({
    initialCount: REGISTRY_LABELS_PAGE_SIZE,
    loaded: labels.length,
    total: data?.pages.at(-1)?.totalCount,
    hasMore: hasNextPage,
    fetchMore: infiniteFetchMore(fetchNextPage, (page) => page.labels.length),
    resetKey: address,
  })

  if (isLoading || registryQuery.isLoading || ancestorExpiry.isLoading)
    return <LoadingSpinner title="Loading labels..." />

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
      {/* Room for the expiry beside the fixed columns, so a narrow screen scrolls instead of overlapping them. */}
      <div className="[&_table]:min-w-170">
        <DataTable
          columns={columns}
          data={labels
            .slice(0, loader.shown)
            .map((label) => ({ ...label, ...parentExpiry }))}
        />
      </div>
      <ListLoader {...loader} />
    </>
  )
}
