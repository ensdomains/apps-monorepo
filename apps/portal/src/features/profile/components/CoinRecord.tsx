import {
  coinNameToTypeMap,
  type coinTypeToNameMap,
} from '@ensdomains/address-encoder'
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

  // non-EVM
  [coinNameToTypeMap.btc]: '/icons/btc.svg',
  [coinNameToTypeMap.doge]: '/icons/doge.svg',
} as const

export type CoinTypeWithIcon = keyof typeof icons

export const CoinRecord = ({
  coinType,
  value,
  className,
}: {
  coinType: CoinTypeWithIcon
  value?: string
  className?: string
}) => {
  if (!value) return null
  return (
    <img
      src={icons[coinType]}
      height={24}
      width={24}
      className={cn(
        'first:z-10 h-6 w-max duration-150 will-change-transform hover:-translate-y-[2px]',
        className,
      )}
      alt={coinType}
    />
  )
}
