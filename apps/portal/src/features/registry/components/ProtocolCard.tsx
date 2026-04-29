import { Layers } from 'lucide-react'
import { BlockCard } from '@/features/dashboard/components'
import type { ProtocolVersion } from '@/utils/types'

type ProtocolCardProps = {
  protocol: ProtocolVersion
  asRow?: boolean
}

export function ProtocolCard({ protocol, asRow }: ProtocolCardProps) {
  if (asRow) {
    return (
      <div className="flex items-center gap-4 w-full">
        <Layers className="size-4 shrink-0 text-icon-foreground" />
        <span className="text-sm text-muted-foreground w-24 shrink-0">
          Protocol
        </span>
        <span className="text-sm font-medium text-foreground">{protocol}</span>
      </div>
    )
  }

  return (
    <BlockCard className="gap-3">
      <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          <Layers className="size-4 shrink-0" />
          <span className="text-sm truncate">Protocol</span>
        </div>
        <span className="text-sm font-medium text-foreground shrink-0">
          {protocol}
        </span>
      </div>
    </BlockCard>
  )
}
