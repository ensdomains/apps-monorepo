import type { NameRecords, RecordAnswer, RecordKey } from './types'

export const CONTENTHASH_KEY = 'contenthash' as const
export const AVATAR_KEY = 'avatar' as const

/** ENSIP-19 default EVM address coin type (`0x80000000`). */
export const DEFAULT_EVM_COIN_TYPE = 2147483648
export const ETH_COIN_TYPE = 60

/** `text:<key>`. Keys with whitespace or commas cannot be requested (400). */
export const textKey = (key: string): RecordKey => `text:${key}`

/** `addr:<coin_type>` with the coin type as a decimal string. */
export const addrKey = (coinType: number | bigint): RecordKey =>
  `addr:${coinType.toString()}`

export type ParsedRecordKey =
  | { readonly kind: 'text'; readonly key: string }
  | { readonly kind: 'addr'; readonly coinType: number }
  | { readonly kind: 'contenthash' }
  | { readonly kind: 'avatar' }

const DECIMAL = /^(0|[1-9][0-9]*)$/

/**
 * Parse a record key from `records`, `known_keys` or history `data.key`.
 * Returns `undefined` for keys outside the record grammar (`name`, `abi:<ct>`,
 * or a coin type beyond `Number.MAX_SAFE_INTEGER`).
 */
export const parseRecordKey = (key: string): ParsedRecordKey | undefined => {
  if (key === CONTENTHASH_KEY) return { kind: 'contenthash' }
  if (key === AVATAR_KEY) return { kind: 'avatar' }
  if (key.startsWith('text:') && key.length > 'text:'.length) {
    return { kind: 'text', key: key.slice('text:'.length) }
  }
  if (key.startsWith('addr:')) {
    const digits = key.slice('addr:'.length)
    const coinType = Number(digits)
    return DECIMAL.test(digits) && Number.isSafeInteger(coinType)
      ? { kind: 'addr', coinType }
      : undefined
  }
  return undefined
}

export const isRecordKey = (key: string): key is RecordKey =>
  parseRecordKey(key) !== undefined

/** EVM coin types per ENSIP-19: 60, and 2147483648 through 4294967295. */
export const isEvmCoinType = (coinType: number): boolean =>
  coinType === ETH_COIN_TYPE ||
  (coinType >= DEFAULT_EVM_COIN_TYPE && coinType <= 0xffffffff)

/** Narrow a keyed answer to one that carries a value. */
export const isOkRecordAnswer = (
  answer: RecordAnswer | undefined,
): answer is Extract<RecordAnswer, { status: 'ok' }> => answer?.status === 'ok'

/** The value of `key` when it answered `ok`, else `undefined`. */
export const getRecordValue = (
  records: NameRecords['records'],
  key: string,
): string | undefined => {
  const answer = records[key]
  return isOkRecordAnswer(answer) ? answer.value : undefined
}
