import { Network } from 'lucide-react'
import { BlockCard } from '@/features/dashboard/components'

type LabelCardProps = {
  label: string
}

export function LabelCard({ label }: LabelCardProps) {
  return (
    <BlockCard className="gap-3">
      <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          <Network className="size-4 shrink-0" />
          <span className="text-sm truncate">Label</span>
        </div>
        <span className="text-sm font-medium text-foreground shrink-0 truncate">
          {label}
        </span>
      </div>
    </BlockCard>
  )
}
