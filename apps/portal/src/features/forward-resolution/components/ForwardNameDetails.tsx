import { EntityBadge } from '@/components/EntityBadge'
import { InfoRow } from '@/components/InfoCard'
import { ADDRESS_HISTORY_EVENT_TYPES } from '@/features/history/addressHistoryEventTypes'
import { HistoryTimeline } from '@/features/history/components/HistoryTimeline'
import { fromCoinType } from '@/lib/utils'
import { CoinTypeLabel } from './CoinTypeLabel'
import type { ForwardName } from './ForwardNamesTable/columns'

export const ForwardNameDetails = ({ name, coinTypes }: ForwardName) => {
  const coins = coinTypes.map((coin) =>
    fromCoinType(BigInt(Number.parseInt(coin, 10))),
  )

  return (
    <div className="flex flex-col p-6 gap-6 [&_[data-slot=info-row]]:px-0">
      <h2 className="font-sans text-h2">{name}</h2>
      <div className="flex flex-col">
        <InfoRow label="Name">
          <EntityBadge variant="name" name={name} showAvatar>
            {name}
          </EntityBadge>
        </InfoRow>
        <InfoRow label="Records">
          <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1">
            {coins.map((coin) => (
              <CoinTypeLabel coin={coin} key={coin} />
            ))}
          </div>
        </InfoRow>
      </div>
      <HistoryTimeline
        name={name}
        scope={ADDRESS_HISTORY_EVENT_TYPES}
        heading={<h2 className="text-caps text-foreground">History</h2>}
        emptyTitle="No resolution history"
        emptyDescription="Resolution record changes will appear here as they happen."
      />
    </div>
  )
}
