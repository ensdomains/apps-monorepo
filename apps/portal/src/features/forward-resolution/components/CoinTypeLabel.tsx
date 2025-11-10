import type { ReverseRegistrarCoinId } from '@ens-apps/l2-primary/reverseRegistrarCoinIds'
import { LinkIcon } from 'lucide-react'
import { icons, names } from '@/lib/reverseRegistrarCoinId'

export const CoinTypeLabel = ({ coin }: { coin: number }) =>
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
        src={icons[coin as ReverseRegistrarCoinId]}
      />{' '}
      {names[coin as ReverseRegistrarCoinId]}
    </span>
  ) : coin === 0 ? (
    <span
      className="flex flex-row gap-1 p-0.5 pr-2 bg-secondary rounded-2xl items-center"
      key={coin}
    >
      <LinkIcon className="size-4" />
      <span>Default</span>
    </span>
  ) : (
    <span key={coin}>{coin}</span>
  )
