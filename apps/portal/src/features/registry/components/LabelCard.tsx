import { Network } from 'lucide-react'
import { BlockCard } from '@/features/dashboard/components'

type LabelCardProps = {
  label: string
  asRow?: boolean
}

export function LabelCard({ label, asRow }: LabelCardProps) {
  if (asRow) {
    return (
      <div className="flex items-center gap-4 w-full">
        <Network className="size-4 shrink-0 text-icon-foreground" />
        <span className="text-sm text-muted-foreground w-24 shrink-0">
          Label
        </span>
        <span className="text-sm font-medium text-foreground truncate">
          {label}
        </span>
      </div>
    )
  }

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
