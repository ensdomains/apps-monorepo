import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
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

const RoleDiff = ({ entry }: { entry: RoleHistoryEntry }) => {
  const added = entry.newRoles.filter((r) => !entry.oldRoles.includes(r))
  const removed = entry.oldRoles.filter((r) => !entry.newRoles.includes(r))

  return (
    <div className="flex flex-wrap gap-1">
      {added.map((role) => (
        <Badge
          key={role}
          variant="secondary"
          className="bg-green-100 text-green-800 text-xs"
        >
          + {role}
        </Badge>
      ))}
      {removed.map((role) => (
        <Badge
          key={role}
          variant="secondary"
          className="bg-red-100 text-red-800 text-xs"
        >
          - {role}
        </Badge>
      ))}
      {added.length === 0 && removed.length === 0 && (
        <span className="text-quartz-400 text-sm">No change</span>
      )}
    </div>
  )
}

const formatDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const RoleHistoryTable = ({
  name,
  label,
}: {
  name: string
  label: string
}) => {
  const { data, isLoading, error } = useQuery(
    getRoleHistoryQueryOptions({ name, label }),
  )

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
      <p className="text-quartz-400 text-sm py-4">No role history found.</p>
    )
  }

  return (
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
            <TableCell className="px-4 sm:px-6 py-3 text-sm text-quartz-600">
              {formatDate(entry.timestamp)}
            </TableCell>
            <TableCell className="px-4 sm:px-6 py-3">
              <AddressDisplay address={entry.account} />
            </TableCell>
            <TableCell className="px-4 sm:px-6 py-3">
              <RoleDiff entry={entry} />
            </TableCell>
            <TableCell className="px-4 sm:px-6 py-3">
              <div className="flex items-center gap-2 text-xs text-quartz-500">
                <span>{entry.oldRoles.length} roles</span>
                <ArrowRight className="size-3" />
                <span>{entry.newRoles.length} roles</span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
