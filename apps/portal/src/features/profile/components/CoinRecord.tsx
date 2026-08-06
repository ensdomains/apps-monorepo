import {
  coinNameToTypeMap,
  type coinTypeToNameMap,
} from '@ensdomains/address-encoder'
import { Link } from '@tanstack/react-router'
import { CopyChip } from '@/components/EntityBadge'
import { cn } from '@/lib/utils'

type CoinType = keyof typeof coinTypeToNameMap

const icons: Partial<Record<CoinType, string>> = {
  // EVM
  [coinNameToTypeMap.eth]: '/icons/eth.svg',
  [coinNameToTypeMap.op]: '/icons/op.svg',
  [coinNameToTypeMap.arb1]: '/icons/arb.svg',
  [coinNameToTypeMap.base]: '/icons/base.svg',
  [coinNameToTypeMap.linea]: '/icons/linea.svg',
  [coinNameToTypeMap.scr]: '/icons/scroll.svg',
  [coinNameToTypeMap.mantle]: '/icons/mantle.svg',
  [coinNameToTypeMap.bnb]: '/icons/bnb.svg',

  // non-EVM
  [coinNameToTypeMap.btc]: '/icons/btc.svg',
  [coinNameToTypeMap.doge]: '/icons/doge.svg',
  [coinNameToTypeMap.sol]: '/icons/sol.svg',
  [coinNameToTypeMap.strk]: '/icons/strk.svg',
} as const

export type CoinTypeWithIcon = keyof typeof icons

export const CoinRecord = ({
  name,
  coinType,
  value,
}: {
  name: string
  coinType: CoinTypeWithIcon
  value?: string
}) => {
  if (!value) return null
  return (
    <div className="group/coin relative flex">
      <div
        className={cn(
          'absolute bottom-full left-0 z-50 pb-1.5',
          'opacity-0 pointer-events-none transition-opacity',
          'group-hover/coin:opacity-100 group-hover/coin:pointer-events-auto',
          'group-focus-within/coin:opacity-100 group-focus-within/coin:pointer-events-auto',
        )}
      >
        <CopyChip value={value} label={value} className="font-mono shadow-sm" />
      </div>
      <Link
        to="/$name/address"
        params={{ name }}
        aria-label={`${coinType} address — view address resolution`}
        className={cn(
          'block rounded-full outline-hidden',
          'group-hover/coin:ring-[3px] group-hover/coin:ring-neutral-8',
          'focus-visible:ring-[3px] focus-visible:ring-neutral-8',
        )}
      >
        <img
          src={icons[coinType]}
          alt={coinType}
          className="block size-6 rounded-full"
        />
      </Link>
    </div>
  )
}
