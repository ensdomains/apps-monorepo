import { Plus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui/button'
import type { TextRecordDef } from '../data/records/types'
import { IconRenderer } from './IconRenderer'
import { pillAnimation, pillContainerAnimation } from './motion'

interface AddTextRecordsPillsProps {
  records: TextRecordDef[]
  onAdd: (keys: string[]) => void
}

export const AddTextRecordsPills = ({
  records,
  onAdd,
}: AddTextRecordsPillsProps) => {
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {records.length > 0 && (
        <motion.div
          className="flex flex-wrap gap-3 pb-2"
          {...pillContainerAnimation(reduceMotion)}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {records.map((record) => (
              <motion.div key={record.key} {...pillAnimation(reduceMotion)}>
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
