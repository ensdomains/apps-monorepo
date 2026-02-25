import { Minus, Plus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TextRecordDef } from '../data/records/types'
import { IconRenderer } from './IconRenderer'
import { pillAnimation, pillContainerAnimation } from './motion'

interface AddTextRecordsPillsProps {
  records: TextRecordDef[]
  activeKeys: string[]
  onAdd: (keys: string[]) => void
  onRemove: (key: string) => void
}

export const AddTextRecordsPills = ({
  records,
  activeKeys,
  onAdd,
  onRemove,
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
            {records.map((record) => {
              const isActive = activeKeys.includes(record.key)
              return (
                <motion.div key={record.key} {...pillAnimation(reduceMotion)}>
                  <Button
                    className={cn(
                      'h-auto w-auto gap-2 rounded-full px-4 py-2',
                      isActive
                        ? 'bg-neutral-600 text-neutral-300 hover:bg-neutral-500 hover:text-neutral-200'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() =>
                      isActive ? onRemove(record.key) : onAdd([record.key])
                    }
                    type="button"
                    variant={isActive ? 'ghost' : 'secondary'}
                  >
                    <IconRenderer className="size-4" icon={record.icon} />
                    <span>{record.name}</span>
                    {isActive ? (
                      <Minus className="size-4" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                  </Button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
