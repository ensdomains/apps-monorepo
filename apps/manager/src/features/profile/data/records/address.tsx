import {
  getCoinTypeForReverseRegistrarChainId,
  L2_REVERSE_REGISTRAR_CHAIN_IDS,
} from '@ens-apps/l2-primary/v1'
import { coinTypeToNameMap } from '@ensdomains/address-encoder'
import { coinIcons } from '@/assets/coins/'
import { envConfig } from '@/config'
import type { AddressRecordDef } from './types'

// Key overrides by canonical coin type, before deployment-specific L2 mapping.
// Artwork aliases affect presentation only, never the address coder or record key.
const ADDRESS_PRESENTATION_OVERRIDES: Readonly<
  Record<number, { readonly name?: string; readonly iconKey?: string }>
> = {
  714: { name: 'Binance Chain' },
  2147483648: { name: 'Any EVM chain' },
  2147483704: { iconKey: 'bnb' },
  2147526762: { iconKey: 'avax' },
  2148018000: { iconKey: 'scroll' },
}

// `address-encoder` only knows the canonical (mainnet) coin types, but this
// deployment keys L2 records on the TESTNET chain id — the coin type the
// Sepolia `L2ReverseRegistrar` and `<hex(coinType)>.reverse` namespaces use.
const deploymentCoinTypeByCanonical = new Map(
  L2_REVERSE_REGISTRAR_CHAIN_IDS.map((chainId) => [
    getCoinTypeForReverseRegistrarChainId(chainId, 'mainnet'),
    getCoinTypeForReverseRegistrarChainId(chainId, envConfig.network),
  ]),
)

const rawAddressRecords: AddressRecordDef[] = Object.entries(
  coinTypeToNameMap,
).map(([coinType, [notation, name]]) => {
  const canonicalCoinType = Number(coinType)
  const override = ADDRESS_PRESENTATION_OVERRIDES[canonicalCoinType]
  return {
    coinType:
      deploymentCoinTypeByCanonical.get(canonicalCoinType) ?? canonicalCoinType,
    name: override?.name ?? name,
    notation,
    icon: coinIcons[override?.iconKey ?? notation],
  }
})

// Optional custom sort preference for addresses (by coinType or notation)
// Put most important chains first; remaining follow encoder order
const PREFERRED_ADDRESS_ORDER: Array<number | { notation: string }> = [
  60, // ETH
  0, // BTC
  { notation: 'OP' },
  { notation: 'ARB' },
  { notation: 'MATIC' },
  { notation: 'ETH' }, // for common L2s that share ETH notation
  { notation: 'BNB' },
  { notation: 'AVAX' },
]

const addressPreferenceIndex = new Map<string, number>()
for (const [index, pref] of PREFERRED_ADDRESS_ORDER.entries()) {
  if (typeof pref === 'number') addressPreferenceIndex.set(`ct:${pref}`, index)
  else addressPreferenceIndex.set(`nt:${pref.notation}`, index)
}

const getAddressPreference = ({ coinType, notation }: AddressRecordDef) => {
  return Math.min(
    addressPreferenceIndex.get(`ct:${coinType}`) ?? Infinity,
    notation
      ? (addressPreferenceIndex.get(`nt:${notation}`) ?? Infinity)
      : Infinity,
  )
}

export const addressRecords: AddressRecordDef[] = [...rawAddressRecords].sort(
  (a, b) => {
    const aPref = getAddressPreference(a)
    const bPref = getAddressPreference(b)
    if (aPref !== bPref) return aPref - bPref
    return a.coinType - b.coinType
  },
)

const addressPresentationIndex = new Map(
  addressRecords.map((record) => [record.coinType, record]),
)

export const getAddressPresentation = (coinType: number) => {
  const record = addressPresentationIndex.get(coinType)
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
    icon: record?.icon,
  }
}
