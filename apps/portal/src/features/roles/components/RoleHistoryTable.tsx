import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getRoleHistoryQueryOptions,
  type RoleHistoryEntry,
} from '@/features/roles/hooks/useRoleHistory'
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'

const RoleDiff = ({ entry }: { readonly entry: RoleHistoryEntry }) => {
  const added = entry.newRoles.filter((r) => !entry.oldRoles.includes(r))
  const removed = entry.oldRoles.filter((r) => !entry.newRoles.includes(r))

  return (
    <div className="flex flex-wrap gap-1">
      {added.map((role) => (
        <Badge key={role} variant="success">
          + {role}
        </Badge>
      ))}
      {removed.map((role) => (
        <Badge key={role} variant="danger">
          - {role}
        </Badge>
      ))}
      {added.length === 0 && removed.length === 0 && (
        <span className="text-muted-foreground text-sm">No change</span>
      )}
    </div>
  )
}

export const RoleHistoryTable = ({
  name,
  label,
  account,
}: {
  readonly name: string
  readonly label?: string
  readonly account?: Address
}) => {
  const {
    data: allData,
    isLoading,
    error,
  } = useQuery(getRoleHistoryQueryOptions({ name, label }))

  // Filter by account if provided
  const data =
    account && allData
      ? allData.filter(
          (entry) => entry.account.toLowerCase() === account.toLowerCase(),
        )
      : allData

  if (isLoading) return <LoadingSpinner title="Loading role history" />

  if (error) {
    return (
      <ErrorMessage
        title="Failed to load role history"
        description={error.cause?.message}
      />
    )
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm p-4">
        No role history found.
      </p>
    )
  }

  return (
    <div className="border rounded-sm overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Changes</TableHead>
            <TableHead>Roles</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((entry) => (
            <TableRow key={`${entry.transactionHash}-${entry.account}`}>
              <TableCell className="px-4 sm:px-6 py-3 text-sm text-muted-foreground">
                {formatTimestamp(BigInt(entry.timestamp))}
              </TableCell>
              <TableCell className="px-4 sm:px-6 py-3">
                <AddressDisplay address={entry.account} />
              </TableCell>
              <TableCell className="px-4 sm:px-6 py-3">
                <RoleDiff entry={entry} />
              </TableCell>
              <TableCell className="px-4 sm:px-6 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{entry.oldRoles.length} roles</span>
                  <ArrowRight className="size-3" />
                  <span>{entry.newRoles.length} roles</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
