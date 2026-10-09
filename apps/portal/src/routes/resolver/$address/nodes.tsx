import { useQuery } from '@tanstack/react-query'
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
import type { Address } from 'viem'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
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
import { ResolverNodesNotice } from '@/features/resolver/components/ResolverNodesNotice'
import { rolesForNode } from '@/features/resolver/helpers/rolesForNode'
import {
  getResolverNodesQueryOptions,
  getResolverOverviewQueryOptions,
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
): NodeDetailSheetProps['rolesStatus'] => {
  if (overview.isError) return 'error'
  const resolver = overview.data
  if (resolver === undefined) return 'loading'
  // A resolver bigname has not indexed has no roles to list.
  if (resolver === null) return 'full'
  if (resolver.rolesStatus === 'unsupported') return 'unsupported'
  return roles.some((role) => role.resource === null)
    ? 'partial'
    : resolver.rolesStatus
}

export const Route = createFileRoute('/resolver/$address/nodes')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) =>
    Promise.all([
      queryClient.prefetchQuery(
        getResolverNodesQueryOptions({ address: params.address as Address }),
      ),
      queryClient.prefetchQuery(
        getResolverOverviewQueryOptions({
          address: params.address as Address,
        }),
      ),
    ]),
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

  // Every bound name, paged past the overview's first page.
  const {
    data: boundNames,
    isLoading,
    error,
  } = useQuery(getResolverNodesQueryOptions({ address: address as Address }))
  // Only the role rows the detail sheet shows come from the overview.
  const overview = useQuery(
    getResolverOverviewQueryOptions({ address: address as Address }),
  )
  const resolver = overview.data

  const nodes = boundNames?.nodes ?? []
  const roles = resolver?.roles ?? []

  const nodeRoles = selectedNode ? rolesForNode(roles, selectedNode) : []

  const columns = useMemo(() => createNodesColumns(address), [address])

  const table = useReactTable({
    data: nodes as ResolverNode[],
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

  if (isLoading) return <LoadingMessage />
  if (error)
    return (
      <ErrorMessage
        compact
        description="Error fetching nodes. Please refresh the page."
      />
    )

  if (nodes.length === 0)
    return (
      <div className="flex flex-col gap-8">
        <PageHeading parent={{ type: 'resolver', address: address as Address }}>
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
      <PageHeading parent={{ type: 'resolver', address: address as Address }}>
        Nodes
      </PageHeading>

      <ResolverNodesNotice
        count={nodes.length}
        isPartial={boundNames?.isPartial}
      />

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
      </NodeDetailSheet>
    </div>
  )
}
