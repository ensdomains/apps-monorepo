import {
  getCoinTypeForReverseRegistrarChainId,
  L2_REVERSE_REGISTRAR_CHAIN_IDS,
} from '@ens-apps/l2-primary/v1'
import {
  coinNameToTypeMap,
  coinTypeToNameMap,
} from '@ensdomains/address-encoder'
import {
  coinTypeToEvmChainId,
  SLIP44_MSB,
} from '@ensdomains/address-encoder/utils'

export interface AddressRecordOption {
  readonly coinType: number
  readonly name: string
  readonly notation: string
  readonly chainId?: number
}

// The current encoder omits these older records, which Manager can still display.
const REMOVED_COINS: Readonly<
  Record<number, readonly [notation: string, name: string]>
> = {
  55: ['aib', 'AIB'],
  105: ['strat', 'Stratis'],
  134: ['lsk', 'Lisk'],
  178: ['poaLegacy', '[LEGACY] POA'],
  194: ['eos', 'EOS'],
  204: ['bcn', 'Bytecoin'],
  330: ['luna', 'Terra'],
  367: ['abbc', 'ABBC'],
  415: ['etn', 'Electroneum'],
  489: ['cca', 'Counos'],
  535: ['xhv', 'Haven Protocol'],
  568: ['lrg', 'Large Coin'],
  569: ['sero', 'Super Zero Protocol'],
  571: ['ccxx', 'Counos X'],
  573: ['srm', 'Serum'],
  576: ['bps', 'BitcoinPoS'],
  714: ['bnb', 'Binance Chain'],
  904: ['hnt', 'Helium'],
  999: ['bcd', 'Bitcoin Diamond'],
  99999: ['wicc', 'Waykichain'],
  2147483747: ['poa', 'POA'],
}

function getChainId(coinType: number): number | undefined {
  if (coinType === coinNameToTypeMap.eth) return 1
  // The encoder's SLIP-44 RSK coder uses the chain-30 checksum.
  if (coinType === coinNameToTypeMap.rbtc) return 30
  if (coinType > SLIP44_MSB && coinType <= 0xffffffff) {
    return coinTypeToEvmChainId(coinType)
  }
  return undefined
}

function toAddressRecordOption([id, [notation, name]]: readonly [
  string,
  readonly [string, string],
]): AddressRecordOption {
  const coinType = Number(id)
  const chainId = getChainId(coinType)
  return Object.freeze({
    coinType,
    notation,
    name: coinType === coinNameToTypeMap.default ? 'Any EVM chain' : name,
    ...(chainId === undefined ? {} : { chainId }),
  })
}

export const CANONICAL_ADDRESS_RECORDS = Object.freeze(
  Object.entries(coinTypeToNameMap).map(toAddressRecordOption),
)

export const REMOVED_ADDRESS_RECORDS = Object.freeze(
  Object.entries(REMOVED_COINS).map(toAddressRecordOption),
)

const CANONICAL_ADDRESS_RECORD_INDEX = new Map(
  CANONICAL_ADDRESS_RECORDS.map((record) => [record.coinType, record]),
)

export const SEPOLIA_ADDRESS_RECORDS = Object.freeze(
  L2_REVERSE_REGISTRAR_CHAIN_IDS.flatMap((chainId) => {
    const canonicalCoinType = getCoinTypeForReverseRegistrarChainId(
      chainId,
      'mainnet',
    )
    const canonical = CANONICAL_ADDRESS_RECORD_INDEX.get(canonicalCoinType)
    if (canonical === undefined) return []

    const coinType = getCoinTypeForReverseRegistrarChainId(chainId, 'sepolia')
    return [
      Object.freeze({
        ...canonical,
        canonicalCoinType,
        coinType,
        chainId: coinTypeToEvmChainId(coinType),
        name: `${canonical.name} Sepolia`,
      }),
    ]
  }),
)

const ADDRESS_ICON_ALIASES: ReadonlyMap<string, string> = new Map([
  ['bsc', 'bnb'],
  ['avaxc', 'avax'],
  ['scr', 'scroll'],
  ['lisk', 'lsk'],
])

/** Returns the artwork key for a known record, including records without artwork. */
export function getAddressRecordIconKey(coinType: number): string | undefined {
  const notation =
    CANONICAL_ADDRESS_RECORD_INDEX.get(coinType)?.notation ??
    REMOVED_COINS[coinType]?.[0] ??
    SEPOLIA_ADDRESS_RECORDS.find((record) => record.coinType === coinType)
      ?.notation
  if (notation === undefined) return undefined

  const key = notation.replace(/Legacy$/, '')
  return ADDRESS_ICON_ALIASES.get(key) ?? key
}

const PREFERRED_COIN_TYPES: readonly number[] = [
  coinNameToTypeMap.eth,
  coinNameToTypeMap.default,
  coinNameToTypeMap.btc,
  coinNameToTypeMap.sol,
  coinNameToTypeMap.matic,
  coinNameToTypeMap.op,
  coinNameToTypeMap.arb1,
  coinNameToTypeMap.base,
]

const ADDRESS_RECORD_OPTIONS = [
  ...PREFERRED_COIN_TYPES.flatMap((coinType) =>
    CANONICAL_ADDRESS_RECORDS.filter((record) => record.coinType === coinType),
  ),
  ...CANONICAL_ADDRESS_RECORDS.filter(
    ({ coinType, notation }) =>
      !PREFERRED_COIN_TYPES.includes(coinType) && !notation.endsWith('Legacy'),
  ),
  ...SEPOLIA_ADDRESS_RECORDS,
]

export function searchAddressRecords(
  query: string,
): readonly AddressRecordOption[] {
  const search = query.trim().toLowerCase()
  const matches = ADDRESS_RECORD_OPTIONS.filter(
    ({ name, notation, coinType, chainId }) =>
      name.toLowerCase().includes(search) ||
      notation.toLowerCase().includes(search) ||
      String(coinType).includes(search) ||
      chainId?.toString().includes(search),
  )
  const isExactNumber = ({ coinType, chainId }: AddressRecordOption): boolean =>
    String(coinType) === search || chainId?.toString() === search
  return [
    ...matches.filter(isExactNumber),
    ...matches.filter((record) => !isExactNumber(record)),
  ]
}
