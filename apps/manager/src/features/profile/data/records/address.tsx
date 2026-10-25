import {
  getCoinTypeForReverseRegistrarChainId,
  L2_REVERSE_REGISTRAR_CHAIN_IDS,
} from '@ens-apps/l2-primary/v1'
import {
  coinNameToTypeMap,
  coinTypeToNameMap,
} from '@ensdomains/address-encoder'
import SiBitcoinsv from '@icons-pack/react-simple-icons/icons/SiBitcoinsv'
import SiChianetwork from '@icons-pack/react-simple-icons/icons/SiChianetwork'
import SiSui from '@icons-pack/react-simple-icons/icons/SiSui'
import { coinIcons } from '@/assets/coins/'
import { envConfig } from '@/config'
import type { AddressRecordDef } from './types'

// Key overrides by canonical coin type, before deployment-specific L2 mapping.
// Artwork aliases affect presentation only, never the address coder or record key.
const ADDRESS_PRESENTATION_OVERRIDES: Readonly<
  Record<number, { readonly name?: string; readonly iconKey?: string }>
> = {
  [coinNameToTypeMap.bnb]: { name: 'Binance Chain' },
  [coinNameToTypeMap.default]: { name: 'Any EVM chain' },
  [coinNameToTypeMap.bsc]: { iconKey: 'bnb' },
  [coinNameToTypeMap.avaxc]: { iconKey: 'avax' },
  [coinNameToTypeMap.scr]: { iconKey: 'scroll' },
}

// Reuse the installed brand library for coins without bundled SVGs. These are
// local components: address rendering never depends on a remote icon service.
const ADDITIONAL_COIN_ICONS: Readonly<
  Record<string, React.FC<{ className?: string }>>
> = {
  sui: ({ className }) => <SiSui className={className} color="default" />,
  bsv: ({ className }) => <SiBitcoinsv className={className} color="default" />,
  xch: ({ className }) => (
    <SiChianetwork className={className} color="default" />
  ),
}

const canonicalAddressRecords: AddressRecordDef[] = Object.entries(
  coinTypeToNameMap,
).map(([coinType, [notation, name]]) => {
  const canonicalCoinType = Number(coinType)
  const override = ADDRESS_PRESENTATION_OVERRIDES[canonicalCoinType]
  return {
    coinType: canonicalCoinType,
    name: override?.name ?? name,
    notation,
    // Encoder legacy records retain their own key/name but share the brand's
    // artwork (e.g. etcLegacy and etc are both Ethereum Classic).
    icon:
      coinIcons[override?.iconKey ?? notation] ??
      coinIcons[notation.replace(/Legacy$/, '')] ??
      ADDITIONAL_COIN_ICONS[notation],
  }
})

const canonicalAddressRecordIndex = new Map(
  canonicalAddressRecords.map((record) => [record.coinType, record]),
)

// Metadata describes the record's actual coin type, independently of the build.
// Keep canonical L2s AND Sepolia aliases: indexed records can contain both.
const sepoliaAddressRecords = L2_REVERSE_REGISTRAR_CHAIN_IDS.flatMap(
  (chainId): AddressRecordDef[] => {
    const canonical = canonicalAddressRecordIndex.get(
      getCoinTypeForReverseRegistrarChainId(chainId, 'mainnet'),
    )
    return canonical
      ? [
          {
            ...canonical,
            coinType: getCoinTypeForReverseRegistrarChainId(chainId, 'sepolia'),
            name: `${canonical.name} Sepolia`,
          },
        ]
      : []
  },
)

const addressPresentationIndex = new Map(
  [...canonicalAddressRecords, ...sepoliaAddressRecords].map((record) => [
    record.coinType,
    record,
  ]),
)

// Only the picker/probe list follows the deployment's reverse-registrar keys.
// Recognizing a canonical record must not also offer it as a new Sepolia record.
const deploymentCoinTypeByCanonical = new Map(
  L2_REVERSE_REGISTRAR_CHAIN_IDS.map((chainId) => [
    getCoinTypeForReverseRegistrarChainId(chainId, 'mainnet'),
    getCoinTypeForReverseRegistrarChainId(chainId, envConfig.network),
  ]),
)
const rawAddressRecords = canonicalAddressRecords.map(
  (record) =>
    addressPresentationIndex.get(
      deploymentCoinTypeByCanonical.get(record.coinType) ?? record.coinType,
    ) ?? record,
)

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
