import { isEvmCoinType } from '@ens-apps/bigname'
import type { ReverseRegistrarChainId } from '@ens-apps/l2-primary/v1'
import { coinTypeToNameMap } from '@ensdomains/address-encoder'
import { LinkIcon } from 'lucide-react'
import { icons, names } from '@/lib/reverseRegistrarChainId'
import { fromCoinType } from '@/lib/utils'

interface CoinTypeLabelProps {
  /** Decimal coin type. */
  coinType: string
}

/** Long name of a non-EVM coin type (`0` → "Bitcoin"), or the coin type itself. */
const nonEvmCoinName = (coinType: number): string =>
  (coinTypeToNameMap as Record<number, readonly [string, string] | undefined>)[
    coinType
  ]?.[1] ?? String(coinType)

const ChainLabel = ({ coin }: { coin: number }) =>
  coin in icons && coin in names ? (
    <span
      className="flex flex-row gap-1 p-0.5 pr-2 bg-secondary rounded-2xl items-center"
      key={coin}
    >
      <img
        key={coin}
        className="size-6"
        alt={coin.toString()}
        src={icons[coin as ReverseRegistrarChainId]}
      />{' '}
      {names[coin as ReverseRegistrarChainId]}
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

/**
 * An address-record coin type: an EVM coin type as its chain (the ENSIP-19
 * default as "Default"), any other coin type by its coin name. Non-EVM coin
 * types must not go through `fromCoinType`, which would read Bitcoin (`0`) as
 * the default chain.
 */
export const CoinTypeLabel = ({ coinType }: CoinTypeLabelProps) => {
  const value = Number(coinType)
  return isEvmCoinType(value) ? (
    <ChainLabel coin={fromCoinType(BigInt(value))} />
  ) : (
    <span>{nonEvmCoinName(value)}</span>
  )
}
