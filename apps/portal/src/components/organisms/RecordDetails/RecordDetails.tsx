import { TrashIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCanEditRecords } from '@/features/profile/hooks/useCanEditRecords'
import type { Record } from '../RecordsTable/columns'

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
      <div className="flex flex-row gap-4 p-6 border border-gray-200 rounded-lg w-full">
        <div className="flex flex-col gap-1">
          <Label>Coin Type</Label>
          <Input className="border-gray-500 min-w-44" />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Value</Label>
          <Input className="border-gray-500" />
        </div>
      </div>
    </div>
  )
}
