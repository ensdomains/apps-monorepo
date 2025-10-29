import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { fromCoinType } from '@/lib/utils'
import { CoinTypeLabel } from './CoinTypeLabel'
import type { ForwardName } from './ForwardNamesTable/columns'

export const ForwardNameDetails = ({ name, coinTypes }: ForwardName) => {
  const coins = coinTypes.map((coin) =>
    fromCoinType(BigInt(Number.parseInt(coin, 10))),
  )

  return (
    <div className="flex flex-col p-4 sm:p-8 gap-4 sm:gap-6">
      <h2 className="text-3xl font-medium">{name}</h2>
      <div className="flex flex-col gap-4">
        <div className="flex flex-row">
          <div className="w-full max-w-40">Name</div>
          <div className="flex flex-row gap-1">
            <NameAvatar height="20px" width="20px" name={name} />
            <CopyableRecord href={`/${name}`} value={name} />
          </div>
        </div>
        <div className="flex flex-row">
          <div className="w-full max-w-40">Records</div>
          <div className="flex flex-row gap-1">
            {coins.map((coin) => (
              <CoinTypeLabel coin={coin} key={coin} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
