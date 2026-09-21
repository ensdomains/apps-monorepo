import {
  getCoinTypeForReverseRegistrarChainId,
  type ReverseRegistrarChainId,
} from '@ens-apps/l2-primary/v1'
import { addressRecords } from '@/features/profile/data/records'
import type { AddressRecordDef } from '@/features/profile/data/records/types'

export interface AddressOption {
  readonly coinType: number
  readonly label: string
}

export interface PickerRecordGroups {
  readonly otherRecords: readonly AddressRecordDef[]
  readonly popularRecords: readonly AddressRecordDef[]
}

export type PickerMode = 'evm' | 'other'

export const ETH_COIN_TYPE = 60
const EVM_COIN_TYPE_OFFSET = 0x80000000
export const BNB_COIN_TYPE = 714
export const BSC_COIN_TYPE = 2147483704

// Shared with the explorer, so both key these L2s on the same coin type. The
// other chains have no reverse registrar and keep their canonical coin type.
const l2CoinType = (chainId: ReverseRegistrarChainId) =>
  getCoinTypeForReverseRegistrarChainId(chainId, 'sepolia')

export const evmChainOptions: readonly AddressOption[] = [
  { coinType: l2CoinType(10), label: 'Optimism' },
  { coinType: l2CoinType(8453), label: 'Base' },
  { coinType: l2CoinType(42161), label: 'Arbitrum' },
  { coinType: 2147483972, label: 'ZKsync' },
  { coinType: 2147483785, label: 'Polygon' },
  { coinType: BSC_COIN_TYPE, label: 'BNB' },
]

export const otherNetworkOptions: readonly AddressOption[] = [
  { coinType: 0, label: 'Bitcoin' },
  { coinType: 501, label: 'Solana' },
  { coinType: BNB_COIN_TYPE, label: 'Binance Chain' },
]

const POPULAR_PICKER_RECORD_COUNT = 5
const EVM_PICKER_POPULAR_COIN_TYPES = [
  2155261425, // Zora
  l2CoinType(534352), // Scroll
  l2CoinType(59144), // Linea
  2147525868, // Celo
  2147483748, // Gnosis
] as const

export const isEvmCoinType = (coinType: number) =>
  coinType >= EVM_COIN_TYPE_OFFSET

interface GetPickerRecordsParams {
  readonly mode: PickerMode
  readonly normalizedSearchValue: string
  readonly unavailableCoinTypes: ReadonlySet<number>
}

const getPickerRecords = ({
  mode,
  normalizedSearchValue,
  unavailableCoinTypes,
}: GetPickerRecordsParams): readonly AddressRecordDef[] => {
  return addressRecords.filter((record) => {
    if (unavailableCoinTypes.has(record.coinType)) return false
    if (mode === 'evm' && !isEvmCoinType(record.coinType)) return false
    if (mode === 'other' && isEvmCoinType(record.coinType)) return false
    if (record.coinType === ETH_COIN_TYPE) return false

    if (!normalizedSearchValue) return true

    return (
      record.name.toLowerCase().includes(normalizedSearchValue) ||
      record.notation?.toLowerCase().includes(normalizedSearchValue)
    )
  })
}

export const getPickerRecordGroups = (
  params: GetPickerRecordsParams,
): PickerRecordGroups => {
  const records = params.normalizedSearchValue ? getPickerRecords(params) : []
  const allAvailableRecords = getPickerRecords({
    ...params,
    normalizedSearchValue: '',
  })
  const preferredPopularCoinTypes =
    params.mode === 'evm' ? EVM_PICKER_POPULAR_COIN_TYPES : []
  const preferredPopularRecords = preferredPopularCoinTypes
    .map((coinType) =>
      allAvailableRecords.find((record) => record.coinType === coinType),
    )
    .filter((record): record is AddressRecordDef => Boolean(record))
  const popularRecords = [
    ...preferredPopularRecords,
    ...allAvailableRecords.filter(
      (record) =>
        !preferredPopularCoinTypes.some(
          (coinType) => coinType === record.coinType,
        ),
    ),
  ].slice(0, POPULAR_PICKER_RECORD_COUNT)
  const popularCoinTypes = new Set(
    popularRecords.map(({ coinType }) => coinType),
  )
  const otherRecords = records.filter(
    (record) => !popularCoinTypes.has(record.coinType),
  )

  return { otherRecords, popularRecords }
}
