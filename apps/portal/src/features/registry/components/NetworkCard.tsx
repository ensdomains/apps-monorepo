import { BlockCard } from '@/features/dashboard/components'

export function NetworkCard() {
  return (
    <BlockCard className="gap-3">
      <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          <img src="/icons/eth.svg" alt="" className="size-4 shrink-0" />
          <span className="text-sm truncate">Network</span>
        </div>
        <span className="text-sm font-medium text-foreground shrink-0">
          Sepolia
        </span>
      </div>
    </BlockCard>
  )
}
