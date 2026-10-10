import { EntityBadge } from '@/components/EntityBadge'
import { InfoRow } from '@/components/InfoCard'
import { AddressRecordHistory } from '@/features/records/components/AddressRecordHistory'
import { fromCoinType } from '@/lib/utils'
import { CoinTypeLabel } from './CoinTypeLabel'
import type { ForwardName } from './ForwardNamesTable/columns'

export const ForwardNameDetails = ({ name, coinTypes }: ForwardName) => {
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
            {coinTypes.map((coinType) => (
              <CoinTypeLabel
                coin={fromCoinType(BigInt(Number.parseInt(coinType, 10)))}
                key={coinType}
              />
            ))}
          </div>
        </InfoRow>
      </div>
      <AddressRecordHistory name={name} />
    </div>
  )
}
