import { SearchIcon, TrashIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCanEditRecords } from '@/features/profile/hooks/useCanEditRecords'
import type { Record } from '../RecordsTable/columns'

const AddressRecordValue = ({ record }: { record: Extract<Record, { type: 'address' }> }) => {
  return (
    <div className="flex flex-row gap-4 p-6 border border-gray-200 rounded-lg w-full items-end">
      <div className="flex flex-col gap-1">
        <Label htmlFor="coin_type">Coin Type</Label>
        <div className="flex flex-row gap-2">
          <div className="border rounded-sm border-gray-300 min-w-44 flex flex-row items-center gap-2 px-3 text-center"><span className="font-mono">{record.id}</span> <span className="font-sans text-gray-500 uppercase">{record.key}</span></div>
          <Button variant="input" className="p-3 w-max"><SearchIcon height={24} width={24} /></Button>
        </div>
      </div>
      <div className="flex flex-col gap-1 w-full">
        <Label>Value</Label>
        <Input className="border-gray-300 w-full font-mono" value={record.value} />
      </div>
      <Button variant="secondary" className="bg-gray-200">
        Update
      </Button>
    </div>
  )
}

const RecordDetailsView = ({ record }: { record: Record }) => {
  switch (record.type) {
    case 'address':
      return <AddressRecordValue record={record} />
    default:
      return <div>Unknown record type</div>
  }
}

export const RecordDetails = ({
  record,
  name,
}: {
  record: Record
  name: string
}) => {
  const { data: canEditRecords } = useCanEditRecords({ name })


  return (
    <div className="py-6 px-8 flex flex-col gap-6">
      <div className="flex flex-row justify-between">
        <h2 className="font-sans capitalize text-[28px] font-medium">
          {record.type}
        </h2>
        {canEditRecords && (
          <Button variant="secondary" className="bg-gray-200">
            <TrashIcon /> Delete record
          </Button>
        )}
      </div>
      <RecordDetailsView record={record} />
    </div>
  )
}
