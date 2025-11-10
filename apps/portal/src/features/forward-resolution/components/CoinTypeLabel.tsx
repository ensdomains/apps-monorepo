import { LinkIcon } from 'lucide-react'
import type { CoinType } from '@/lib/coinType'
import { icons, names } from '@/lib/coinType'

interface CoinTypeLabelProps {
  coin: number
}

export const CoinTypeLabel = ({ coin }: CoinTypeLabelProps) =>
  coin in icons && coin in names ? (
    <span
      className="flex flex-row gap-1 p-0.5 pr-2 bg-secondary rounded-2xl"
      key={coin}
    >
      <img
        key={coin}
        height={24}
        width={24}
        alt={coin.toString()}
        src={icons[coin as CoinType]}
      />{' '}
      {names[coin as CoinType]}
    </span>
  ) : coin === 0 ? (
    <span
      className="flex flex-row gap-1 p-0.5 pr-2 bg-secondary rounded-2xl items-center"
      key={coin}
    >
      <LinkIcon height={16} width={16} />
      <span>Default</span>
    </span>
  ) : (
    <span key={coin}>{coin}</span>
  )
