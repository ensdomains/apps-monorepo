import { decodeAddressResultFromPrimitiveTypes } from '@ensdomains/ensjs/utils'
import {
  publicResolverMultiAddrSnippet,
  publicResolverSingleAddrSnippet,
} from '@ensdomains/ensjs-abi/v1/publicResolver'
import { fromThrowable } from 'neverthrow'
import { decodeFunctionResult, type Hex } from 'viem'

// Bound work even for variable-length formats whose coders have no size check.
// This leaves room for scripts and shielded addresses as well as public keys.
export const MAX_COIN_RECORD_BYTES = 256
const ABI_WORD_BYTES = 32
const MAX_COIN_RESULT_BYTES = MAX_COIN_RECORD_BYTES + 2 * ABI_WORD_BYTES
const EVM_COIN_TYPE_FLAG = 0x80000000

const hasValidCoinLength = (coinType: number, value: Hex): boolean => {
  const byteLength = (value.length - 2) / 2
  if (!Number.isInteger(byteLength) || byteLength > MAX_COIN_RECORD_BYTES) {
    return false
  }

  if (coinType === 121) {
    // ZEN: two prefix bytes + 20-byte transparent or 64-byte shielded payload.
    // https://github.com/HorizenOfficial/zen/blob/master/src/zcash/Address.hpp
    const prefix = value.slice(2, 6).toLowerCase()
    return prefix === '169a' ? byteLength === 66 : byteLength === 22
  }
  if (coinType === 60 || coinType >= EVM_COIN_TYPE_FLAG) {
    return byteLength === 20
  }
  if (coinType === 501) return byteLength === 32

  // Remaining formats retain their coder's format-specific validation.
  return true
}

const decodeRawCoinRecord = fromThrowable((coinType: number, value: Hex) =>
  decodeAddressResultFromPrimitiveTypes({ coin: coinType, decodedData: value }),
)

export const decodeCoinRecord = (coinType: number, value: Hex) => {
  // Check the hex string length before trimming, allocating bytes, or encoding.
  if (!hasValidCoinLength(coinType, value)) return null
  return decodeRawCoinRecord(coinType, value).unwrapOr(null)
}

const decodeCoinResultData = fromThrowable((coinType: number, data: Hex) =>
  decodeFunctionResult({
    abi:
      coinType === 60
        ? publicResolverSingleAddrSnippet
        : publicResolverMultiAddrSnippet,
    functionName: 'addr',
    data,
  }),
)

export const decodeCoinResult = (coinType: number, data: Hex) => {
  // A dynamic bytes result has two ABI words followed by the padded payload.
  // Reject oversized envelopes before the ABI decoder allocates its byte array.
  if (data.length > 2 + MAX_COIN_RESULT_BYTES * 2) return null
  const value = decodeCoinResultData(coinType, data).unwrapOr(null)
  return value === null ? null : decodeCoinRecord(coinType, value)
}
