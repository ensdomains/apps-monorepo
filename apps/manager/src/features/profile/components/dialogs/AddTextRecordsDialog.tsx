import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TextRecordDef } from '../../data/records/types'
import { IconRenderer } from '../IconRenderer'

interface AddTextRecordsDialogProps {
  records: TextRecordDef[]
  onAdd: (keys: string[]) => void
}

export const AddTextRecordsDialog = ({
  records,
  onAdd,
}: AddTextRecordsDialogProps) => {
  if (records.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-3">
      {records.map((record) => (
        <Button
          className="h-auto w-auto gap-2 rounded-full px-4 py-2 text-muted-foreground hover:text-foreground"
          key={record.key}
          onClick={() => onAdd([record.key])}
          type="button"
          variant="secondary"
        >
          <IconRenderer className="size-4" icon={record.icon} />
          <span>{record.name}</span>
          <Plus className="size-4" />
        </Button>
      ))}
    </div>
  )
}
