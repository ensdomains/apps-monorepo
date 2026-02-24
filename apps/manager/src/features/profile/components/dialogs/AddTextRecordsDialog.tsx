import { Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
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
  return (
    <AnimatePresence mode="popLayout">
      {records.length > 0 && (
        <motion.div
          animate={{ opacity: 1, height: 'auto' }}
          className="flex flex-wrap gap-3 pb-2"
          exit={{ opacity: 0, height: 0 }}
          initial={{ opacity: 0, height: 0 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
        >
          <AnimatePresence mode="popLayout">
            {records.map((record) => (
              <motion.div
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.95, filter: 'blur(2px)' }}
                initial={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                key={record.key}
                layout
                transition={{
                  layout: { type: 'spring', bounce: 0.1, duration: 0.25 },
                  default: { duration: 0.12 },
                }}
              >
                <Button
                  className="h-auto w-auto gap-2 rounded-full px-4 py-2 text-muted-foreground hover:text-foreground"
                  onClick={() => onAdd([record.key])}
                  type="button"
                  variant="secondary"
                >
                  <IconRenderer className="size-4" icon={record.icon} />
                  <span>{record.name}</span>
                  <Plus className="size-4" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
