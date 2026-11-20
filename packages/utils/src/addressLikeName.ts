import { base58UncheckedDecode } from '@ensdomains/address-encoder/utils'

// Half an address is enough: a shortened one keeps the start and end people check
const EVM_ADDRESS_LIKE = /^0x[0-9a-f]{20,}$/
const BITCOIN_BECH32_LIKE = /^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{36,62}$/
// Base58 has no `0`; a 32-byte key spells out in at most 44 characters
const LOWERCASED_BASE58 = /^[1-9a-z]{1,44}$/
// Base58 has no `I`, `O` or `l`, so these are the letters with a capital
const CAPITALISABLE_LETTER = /[a-hj-np-z]/g
const LOWERCASE_L = /l/g
const BITCOIN_LEGACY_PREFIX = /^[13]/
const SOLANA_ADDRESS_BYTES = 32
const BITCOIN_LEGACY_ADDRESS_BYTES = 25

// Capitals sort first in base58, so all-capitals spells the smallest key and all-lowercase the largest
const canDecodeTo = (label: string, bytes: number): boolean =>
  base58UncheckedDecode(
    label.replace(CAPITALISABLE_LETTER, (letter) => letter.toUpperCase()),
  ).length <= bytes &&
  bytes <= base58UncheckedDecode(label.replace(LOWERCASE_L, 'L')).length

// ENS lowercases names, so any casing of a Solana or Bitcoin legacy address counts
const isBase58AddressLike = (label: string): boolean =>
  LOWERCASED_BASE58.test(label) &&
  (canDecodeTo(label, SOLANA_ADDRESS_BYTES) ||
    (BITCOIN_LEGACY_PREFIX.test(label) &&
      canDecodeTo(label, BITCOIN_LEGACY_ADDRESS_BYTES)))

/** Whether a label reads like an EVM, Bitcoin or Solana address. */
const isAddressLikeLabel = (label: string): boolean => {
  const lowercased = label.toLowerCase()
  return (
    EVM_ADDRESS_LIKE.test(lowercased) ||
    BITCOIN_BECH32_LIKE.test(lowercased) ||
    isBase58AddressLike(lowercased)
  )
}

/** Whether any label reads like a wallet address, so the name can pass for one. */
export const isAddressLikeName = (name: string): boolean =>
  name.split('.').some(isAddressLikeLabel)
