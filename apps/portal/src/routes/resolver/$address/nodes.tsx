import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowRightFromLineIcon, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { match, P } from 'ts-pattern'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ListLoader } from '@/components/ListLoader/ListLoader'
import {
  infiniteFetchMore,
  useListLoader,
} from '@/components/ListLoader/useListLoader'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import {
  NodeDetailSheet,
  type NodeDetailSheetProps,
} from '@/features/resolver/components/NodeDetailSheet'
import { rolesForNode } from '@/features/resolver/helpers/rolesForNode'
import {
  getResolverNodesQueryOptions,
  getResolverOverviewQueryOptions,
  RESOLVER_NODES_PAGE_SIZE,
  type ResolverNode,
  type ResolverOverview,
} from '@/features/resolver/hooks/useResolverOverview'
import { cn } from '@/lib/utils'
import { queryClient } from '@/utils/queryClient'

/** How much of the node's roles the sheet can claim, until the read completes. */
const toNodeRolesStatus = (
  overview: {
    readonly data?: ResolverOverview | null
    readonly isError: boolean
  },
  roles: readonly ResolverOverview['roles'][number][],
): NodeDetailSheetProps['rolesStatus'] =>
  match(overview)
    .returnType<NodeDetailSheetProps['rolesStatus']>()
    .with({ isError: true }, () => 'error')
    .with({ data: undefined }, () => 'loading')
    // A resolver bigname has not indexed has no roles to list.
    .with({ data: null }, () => 'full')
    .with({ data: { rolesStatus: 'unsupported' } }, () => 'unsupported')
    .with({ data: P.nonNullable }, ({ data }) =>
      roles.some((role) => role.name === null) ? 'partial' : data.rolesStatus,
    )
    .exhaustive()

export const Route = createFileRoute('/resolver/$address/nodes')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  // Started, not awaited: the page renders while the first names load.
  loader: ({ params }) => {
    void queryClient.prefetchInfiniteQuery(
      getResolverNodesQueryOptions({ address: params.address }),
    )
    void queryClient.prefetchQuery(
      getResolverOverviewQueryOptions({ address: params.address }),
    )
  },
})

const createNodesColumns = (
  resolverAddress: string,
): ColumnDef<ResolverNode>[] => [
  {
    accessorKey: 'name',
    header: 'Node',
    cell: ({ row }) => {
      const node = row.original
      return (
        <div className="flex items-center gap-3">
          <NameAvatar
            name={node.name}
            width="28px"
            height="28px"
            rounded="rounded-sm"
          />
          <span className="font-mono text-sm">{node.name}</span>
          <CopyButton value={node.name} />
        </div>
      )
    },
  },
  {
    id: 'active',
    header: 'Active',
    cell: ({ row }) => {
      const active =
        row.original.resolver?.address.toLowerCase() ===
        resolverAddress.toLowerCase()
      return (
        <Badge variant={active ? 'success' : 'destructive'}>
          {active ? 'Active' : 'Inactive'}
        </Badge>
      )
    },
  },
  {
    id: 'more',
    size: 120,
    header: () => null,
    cell: ({ row, table }) => {
      return (
        <div className="flex justify-end pr-4">
          <Button
            variant="default"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              const meta = table.options.meta as {
                onMoreClick?: (r: typeof row) => void
              }
              meta?.onMoreClick?.(row)
            }}
          >
            <ArrowRightFromLineIcon className="h-4 w-4" />
            <span className="text-sm font-medium">More</span>
          </Button>
        </div>
      )
    },
  },
]

function RouteComponent() {
  const { address } = Route.useParams()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [selectedNode, setSelectedNode] = useState<ResolverNode | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const nodesQuery = useInfiniteQuery(getResolverNodesQueryOptions({ address }))
  // Only the role rows the detail sheet shows come from the overview.
  const overview = useQuery(getResolverOverviewQueryOptions({ address }))

  const loadedNodes = useMemo(
    () => nodesQuery.data?.pages.flatMap((page) => page.nodes) ?? [],
    [nodesQuery.data],
  )
  const loader = useListLoader({
    initialCount: RESOLVER_NODES_PAGE_SIZE,
    loaded: loadedNodes.length,
    total: nodesQuery.data?.pages.at(-1)?.totalCount ?? undefined,
    hasMore: nodesQuery.hasNextPage,
    fetchMore: infiniteFetchMore(
      nodesQuery.fetchNextPage,
      (page) => page.nodes.length,
    ),
    resetKey: address,
  })
  const nodes = useMemo(
    () => loadedNodes.slice(0, loader.shown),
    [loadedNodes, loader.shown],
  )
  const roles = overview.data?.roles ?? []

  const nodeRoles = selectedNode ? rolesForNode(roles, selectedNode) : []

  const columns = useMemo(() => createNodesColumns(address), [address])

  const table = useReactTable({
    data: nodes,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    state: { sorting, globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    meta: {
      onMoreClick: (row: Row<ResolverNode>) => {
        setSelectedNode(row.original)
        setSheetOpen(true)
      },
    },
  })

  if (nodesQuery.isLoading) return <LoadingMessage />
  if (nodesQuery.error && !nodesQuery.isFetchNextPageError)
    return (
      <ErrorMessage
        compact
        description="Error fetching nodes. Please refresh the page."
      />
    )

  if (loadedNodes.length === 0)
    return (
      <div className="flex flex-col gap-8">
        <PageHeading parent={{ type: 'resolver', address: address }}>
          Nodes
        </PageHeading>
        <NoResultsMessage
          title="No nodes yet"
          description="Names that resolve through this resolver will appear here."
          className="mx-0"
        />
      </div>
    )

  return (
    <div className="flex flex-col gap-8">
      <PageHeading parent={{ type: 'resolver', address: address }}>
        Nodes
      </PageHeading>

      <InputGroup className="bg-background rounded-sm">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
        />
      </InputGroup>
      {loader.canShowMore && globalFilter && (
        <p className="text-sm text-muted-foreground">
          Search covers the {nodes.length} nodes shown so far. Show more to
          include the rest.
        </p>
      )}

      <NodeDetailSheet
        node={selectedNode}
        roles={nodeRoles}
        rolesStatus={toNodeRolesStatus(overview, roles)}
        resolverAddress={address}
        open={sheetOpen}
        setOpen={setSheetOpen}
      >
        {/* Mobile view */}
        <div className="md:hidden">
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const node = row.original
              const active =
                node.resolver?.address.toLowerCase() === address.toLowerCase()
              return (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 px-4 py-4 border-b border-border last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <NameAvatar
                        name={node.name}
                        width="28px"
                        height="28px"
                        rounded="rounded-sm"
                      />
                      <span className="font-mono text-sm truncate">
                        {node.name}
                      </span>
                      <CopyButton value={node.name} />
                    </div>
                    <Badge variant={active ? 'success' : 'destructive'}>
                      {active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      setSelectedNode(node)
                      setSheetOpen(true)
                    }}
                  >
                    <ArrowRightFromLineIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">More</span>
                  </Button>
                </div>
              )
            })
          ) : (
            <div className="px-6 py-24 text-center border border-border rounded-sm">
              This resolver has no nodes.
            </div>
          )}
        </div>

        {/* Desktop view */}
        <div className="hidden md:block">
          <Table className="relative">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn('px-6', 'h-10 py-0')}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={table.getAllColumns().length}
                    className="h-24 text-center"
                  >
                    This resolver has no nodes.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <ListLoader {...loader} className="py-4" />
      </NodeDetailSheet>
    </div>
  )
}
