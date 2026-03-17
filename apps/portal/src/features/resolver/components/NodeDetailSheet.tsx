import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { DataTable } from '@/components/DataTable'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import {
  type NameRecord,
  columns as recordColumns,
} from '@/features/records/components/RecordsTable/columns'
import type {
  ResolverNode,
  ResolverRole,
} from '@/features/resolver/hooks/useResolverOverview'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { recordsToTableData } from '@/utils/records/recordsToTableData'

type NodeDetailSheetProps = PropsWithChildren & {
  readonly node: ResolverNode | null
  readonly roles: readonly ResolverRole[]
  readonly resolverAddress: string
  readonly open: boolean
  readonly setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

const sidebarRecordColumns = recordColumns.filter((col) => col.id !== 'select')

export const NodeDetailSheet = ({
  children,
  node,
  roles,
  resolverAddress,
  open,
  setOpen,
}: NodeDetailSheetProps) => {
  const isMobile = useIsMobile()
  const [tableView] = useTableViewSettings()

  const isInactive =
    !!node &&
    node.resolver?.address.toLowerCase() !== resolverAddress.toLowerCase()

  const {
    data: profile,
    isLoading: isLoadingRecords,
    error: recordsError,
  } = useQuery({
    ...getProfileQueryOptions({ name: node?.name ?? '' }),
    enabled: !!node,
  })

  const records: NameRecord[] = profile?.records
    ? recordsToTableData(profile.records)
    : []

  const cellClassName = cn('px-4 sm:px-6', tableView.compact ? 'py-2' : 'py-4')

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[640px] bg-white p-0 flex flex-col h-dvh"
      >
        <div className="p-6 shrink-0 border-b">
          <SheetHeader className="p-0 flex flex-row items-center justify-between">
            <SheetTitle className="font-sans text-heading font-medium">
              {node?.name ?? 'Node Details'}
            </SheetTitle>
            {node && (
              <Button variant="secondary" size="sm" asChild>
                <Link to="/$name" params={{ name: node.name }}>
                  Go to name
                </Link>
              </Button>
            )}
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto">
          {node ? (
            <div className="flex flex-col gap-0">
              {isInactive && (
                <div className="mx-6 mt-6 flex flex-col items-center justify-center gap-4 self-stretch rounded-lg bg-garnet-100 p-6 text-sm text-danger">
                  This node is inactive. The records and roles are read only.
                </div>
              )}
              <section className="p-6 border-b flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Records</h3>
                  <Button variant="secondary" size="sm" asChild>
                    <Link to="/$name/records" params={{ name: node.name }}>
                      <ExternalLink className="size-3.5" />
                      Go to records
                    </Link>
                  </Button>
                </div>

                {isLoadingRecords ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : recordsError ? (
                  <p className="text-sm text-danger">
                    Failed to load records:{' '}
                    {recordsError.cause?.message ?? 'Unknown error'}
                  </p>
                ) : records.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No records set for this node.
                  </p>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <DataTable columns={sidebarRecordColumns} data={records} />
                  </div>
                )}
              </section>

              <section className="p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Roles</h3>
                  <Button variant="secondary" size="sm" asChild>
                    <Link to="/$name/roles" params={{ name: node.name }}>
                      <ExternalLink className="size-3.5" />
                      Go to roles
                    </Link>
                  </Button>
                </div>
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No roles assigned for this node.
                  </p>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead>Role Bitmap</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roles.map((role) => (
                          <TableRow
                            key={`${role.account}-${role.roleBitmap}`}
                            className={cn(
                              'hover:bg-quartz-50',
                              tableView.strippedRows && 'odd:bg-quartz-50',
                            )}
                          >
                            <TableCell
                              className={cn(cellClassName, 'font-mono text-xs')}
                            >
                              <div className="flex items-center gap-1">
                                {truncateAddress(role.account)}
                                <CopyButton value={role.account} />
                              </div>
                            </TableCell>
                            <TableCell
                              className={cn(cellClassName, 'font-mono text-xs')}
                            >
                              {role.roleBitmap}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="text-quartz-400 text-center py-12">
              No node selected
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
