import type { ResolverEvent } from "@ensdomains/ensjs/subgraph"
import type { ColumnDef } from "@tanstack/react-table"
import { CopyableRecord } from "@/components/molecules/CopyableRecord"
import { DataTable } from "@/components/molecules/DataTable/DataTable"
import { useBlockTimestamps } from "@/features/profile/hooks/useBlockTimestamps"
import { useNameHistory } from "@/features/profile/hooks/useNameHistory"

type ResolverEventWithTimestamp = ResolverEvent & {
  timestamp?: bigint
}

const columns: ColumnDef<ResolverEventWithTimestamp>[] = [{
  accessorKey: 'timestamp',
  cell({ column, row }) {
    const value = row.getValue(column.id) as bigint

    const date = new Date(Number(value) * 1000)

    return <span>{date.toUTCString()}</span>
  },
}, {
  accessorKey: 'type',
  header: 'Type',
  cell({ column, row }) {
    const value = row.getValue(column.id) as string
    return <span className="font-mono">{value}</span>
  }
}, {
  accessorKey: 'transactionID',
  header: 'Transaction',
  cell({ column, row }) {
    const value = row.getValue(column.id) as string
    return <div className="w-max">
      <CopyableRecord value={value} />
    </div>
  }
}]

const EventTable = ({ events }: { events: ResolverEvent[] }) => {
  const { data: timestamps, isLoading, error } = useBlockTimestamps({ blocks: events.map(e => BigInt(e.blockNumber)) })

  if (isLoading) return <div>Fetching block timestamps...</div>
  if (error || !timestamps) return <div>Failed to fetch block timestamps: {error?.message}</div>

  const data = events.map(ev => ({ ...ev, timestamp: timestamps.get(BigInt(ev.blockNumber)) }))

  return <DataTable data={data} columns={columns} />
}

export const NameHistory = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useNameHistory({ name })


  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div className="flex flex-col gap-1 p-6 border border-secondary rounded-lg w-full">
    <div>
      <h2 className="text-[26px] font-medium">History</h2>
    </div>
    <EventTable events={(data?.resolverEvents || []) as ResolverEvent[]} />
  </div>
}