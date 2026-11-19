import type { EnsNetwork } from '@ens-apps/config'
import {
  type AddressRecordOption,
  CANONICAL_ADDRESS_RECORDS,
  getAddressRecord,
  SEPOLIA_ADDRESS_RECORDS,
} from '@ens-apps/record-catalog/address'

const SEPOLIA_OPTIONS_BY_CANONICAL_COIN_TYPE = new Map(
  SEPOLIA_ADDRESS_RECORDS.map((record) => [record.canonicalCoinType, record]),
)

const ADDRESS_PREFERENCE_INDEX = new Map<string, number>(
  [
    'ct:60',
    'ct:0',
    'nt:OP',
    'nt:ARB',
    'nt:MATIC',
    'nt:ETH',
    'nt:BNB',
    'nt:AVAX',
  ].map((key, index) => [key, index]),
)

const getAddressPreference = ({ coinType, notation }: AddressRecordOption) =>
  Math.min(
    ADDRESS_PREFERENCE_INDEX.get(`ct:${coinType}`) ?? Infinity,
    ADDRESS_PREFERENCE_INDEX.get(`nt:${notation}`) ?? Infinity,
  )

// The picker and resolver import use this deployment's reverse-registrar keys.
export const getProfileAddressOptions = (
  network: EnsNetwork,
): readonly AddressRecordOption[] => {
  const options =
    network === 'sepolia'
      ? CANONICAL_ADDRESS_RECORDS.map(
          (record) =>
            SEPOLIA_OPTIONS_BY_CANONICAL_COIN_TYPE.get(record.coinType) ??
            record,
        )
      : CANONICAL_ADDRESS_RECORDS

  return [...options].sort((a, b) => {
    const aPref = getAddressPreference(a)
    const bPref = getAddressPreference(b)
    if (aPref !== bPref) return aPref - bPref
    return a.coinType - b.coinType
  })
}

// Recognize both deployments and legacy records, including outside the picker.
export const getAddressMetadata = (coinType: number) => {
  const record = getAddressRecord(coinType)
  const isEvmChain =
    Number.isInteger(coinType) &&
    coinType > 0x80000000 &&
    coinType <= 0xffffffff

  return {
    coinType,
    label:
      record?.name ??
      (isEvmChain
        ? `EVM chain ${coinType - 0x80000000}`
        : `Coin type ${coinType}`),
    notation: (record?.notation ?? `#${coinType}`).toUpperCase(),
  }
}
