import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { useId, useState } from 'react'
import type { Address } from 'viem'
import { InvalidNameMessage } from '@/components/InvalidNameMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { columns } from '@/features/reverse-resolution/components/ReverseResolutionTable/columns'
import { ReverseResolutionTable } from '@/features/reverse-resolution/components/ReverseResolutionTable/ReverseResolutionTable'
import { REVERSE_RESOLUTION_NETWORKS } from '@/features/reverse-resolution/config'
import { getReverseResolutionQueryOptions } from '@/features/reverse-resolution/hooks/useReverseResolution'
import { useIsConnectedAddress } from '@/hooks/useIsConnectedAddress'
import { queryClient } from '@/utils/queryClient'

// Stable identity: a fresh `[]` each render makes the table recompute its row
// model, which auto-resets the page index and re-renders.
const NO_ROWS: never[] = []

export const Route = createFileRoute('/addr/$addr/reverse-resolution')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) =>
    queryClient.prefetchQuery(
      getReverseResolutionQueryOptions({
        address: params.addr as Address,
        networks: REVERSE_RESOLUTION_NETWORKS,
      }),
    ),
})

function RouteComponent() {
  const { addr: address } = Route.useParams() as { addr: Address }
  const [sorting, setSorting] = useState<SortingState>([])

  // Same predicate the table uses to decide whether to offer its row actions,
  // so the two can't disagree about whether this page has anything to do.
  const isOwnAddress = useIsConnectedAddress(address)

  const { data, error, isLoading } = useQuery(
    getReverseResolutionQueryOptions({
      address,
      networks: REVERSE_RESOLUTION_NETWORKS,
    }),
  )

  const table = useReactTable({
    data: data ?? NO_ROWS,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  })

  const searchId = useId()

  if (isLoading) return <LoadingMessage />
  if (error)
    return (
      <InvalidNameMessage
        title="Error loading reverse resolution"
        description={
          <>
            {error.cause?.message ||
              error.message ||
              'An error occurred while loading reverse resolution data.'}
            <br />
            You can search for a name or address, or{' '}
            <a
              href="https://support.ens.domains/en/"
              className="underline decoration-dotted"
            >
              visit our support
            </a>{' '}
            for further help.
          </>
        }
      />
    )

  // The hook emits one placeholder row per configured network even when no
  // reverse record exists anywhere, so emptiness means "no row has a name".
  const hasReverseRecords = data?.some((row) => row.name || row.defaultName)

  // On your own address the table renders even with nothing set: its rows are
  // the networks a reverse name *can* be set on, and the row actions are the
  // only way into that flow. Swapping them for a message left the wallet most
  // likely to want the feature with nowhere to go.
  //
  // A visitor still gets the message. Every write here is signer-scoped, so
  // there is genuinely nothing for them to do on someone else's address — the
  // same reason the table withholds its row actions from them.
  if (!data || (!hasReverseRecords && !isOwnAddress))
    return (
      <>
        <header className="flex flex-col gap-4">
          <PageHeading parent={{ type: 'addr', addr: address }}>
            Reverse resolution
          </PageHeading>
        </header>
        <NoResultsMessage
          title="No reverse records yet"
          description="This address doesn't have a reverse record on any network. Records will appear here once one is set."
          className="mx-0"
        />
      </>
    )

  return (
    <>
      <header className="flex flex-col gap-4">
        <div className="flex flex-row justify-between">
          <PageHeading parent={{ type: 'addr', addr: address }}>
            Reverse resolution
          </PageHeading>
        </div>
        {/*
          Without this the table reads as a column of "null"s with no
          explanation. It only shows on your own address, since a visitor never
          reaches a record-less table.
        */}
        {!hasReverseRecords && (
          <p className="text-p text-muted-foreground">
            No reverse records set yet. Open a network below to set its reverse
            name.
          </p>
        )}
        <InputGroup className="bg-background rounded-sm">
          <InputGroupInput
            id={searchId}
            className="w-full"
            placeholder="Search..."
            onChange={(event) => table.setGlobalFilter(event.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </header>
      <ReverseResolutionTable table={table} address={address} />
    </>
  )
}
