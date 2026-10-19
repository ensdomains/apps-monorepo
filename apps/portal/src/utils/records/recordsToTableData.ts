import {
  getCoinTypeForReverseRegistrarChainId,
  L2_REVERSE_REGISTRAR_CHAIN_IDS,
} from '@ens-apps/l2-primary/v1'
import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { envConfig } from '@/config'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import { names } from '@/lib/reverseRegistrarChainId'
import { isOutOfRangeEvmCoinType } from '@/lib/utils'

type Entries<T> = {
  [K in keyof T]-?: [K, T[K]]
}[keyof T][]

/**
 * L2 coin types keyed on this network's testnet chain ids, which
 * address-encoder names "Unknown Chain (<id>)", by the L2's name.
 */
const TESTNET_L2_NAMES = new Map<number, string>(
  L2_REVERSE_REGISTRAR_CHAIN_IDS.flatMap((chainId) => {
    const coinType = getCoinTypeForReverseRegistrarChainId(
      chainId,
      envConfig.network,
    )
    return coinType ===
      getCoinTypeForReverseRegistrarChainId(chainId, 'mainnet')
      ? []
      : [[coinType, names[chainId]] as const]
  }),
)

/**
 * Display key for an address row. An out-of-range EVM type renders as the chain
 * it aliases, so name the raw type instead (WEB-1447).
 */
const addressRecordKey = (coinType: number, symbol: string): string =>
  isOutOfRangeEvmCoinType(coinType)
    ? `Invalid coin type (${coinType})`
    : (TESTNET_L2_NAMES.get(coinType) ?? symbol)

export const recordsToTableData = (
  records: GetRecordsReturnType,
): NameRecord[] => {
  const data: NameRecord[] = []

  for (const [key, value] of Object.entries(
    records,
  ) as Entries<GetRecordsReturnType>) {
    if (key === 'contentHash' && value) {
      data.push({
        type: key,
        value: `${value.protocolType}://${value.decoded}`,
      })
    }
    if (key === 'abi' && value) {
      // ABI can be a string or object, convert to JSON string for display
      const abiValue =
        typeof value.abi === 'string' ? value.abi : JSON.stringify(value.abi)
      data.push({
        type: 'abi',
        value: abiValue,
      })
    }
    if (key === 'texts') {
      for (const { key, value: text } of Object.values(value)) {
        data.push({ key, value: text, type: 'text' })
      }
    }
    if (key === 'coins') {
      for (const { coinType, value: addr, symbol } of Object.values(value)) {
        data.push({
          key: addressRecordKey(coinType, symbol),
          value: addr,
          type: 'address',
          id: coinType,
        })
      }
    }
  }

  return data
}
