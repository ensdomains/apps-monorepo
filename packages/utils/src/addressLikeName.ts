// Half an address is enough: a shortened one keeps the start and end people check
const EVM_ADDRESS_LIKE = /^0x[0-9a-f]{20,}$/
const BITCOIN_BECH32_LIKE = /^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{36,62}$/
// Base58 lowercased: Bitcoin legacy runs 26 to 35 characters, Solana 32 to 44
const BITCOIN_LEGACY_LIKE = /^[13][1-9a-z]{25,34}$/
const SOLANA_LIKE = /^[1-9a-z]{32,44}$/
const DIGIT_LETTER_SWITCH = /\d(?=[a-z])|[a-z](?=\d)/g
const DIGIT = /\d/g
const MIN_BASE58_DIGIT_LETTER_SWITCHES = 3
const MIN_BASE58_DIGIT_SHARE = 1 / 3

const countMatches = (label: string, pattern: RegExp): number =>
  label.match(pattern)?.length ?? 0

// Words share base58's alphabet, so a key also mixes digits in, or clusters them like `so111…112`
const looksLikeBase58Key = (label: string): boolean =>
  countMatches(label, DIGIT_LETTER_SWITCH) >=
    MIN_BASE58_DIGIT_LETTER_SWITCHES ||
  countMatches(label, DIGIT) / label.length >= MIN_BASE58_DIGIT_SHARE

/** Whether a label reads like an EVM, Bitcoin or Solana address. */
const isAddressLikeLabel = (label: string): boolean => {
  const lowercased = label.toLowerCase()
  return (
    EVM_ADDRESS_LIKE.test(lowercased) ||
    BITCOIN_BECH32_LIKE.test(lowercased) ||
    ((BITCOIN_LEGACY_LIKE.test(lowercased) || SOLANA_LIKE.test(lowercased)) &&
      looksLikeBase58Key(lowercased))
  )
}

/** Whether any label reads like a wallet address, so the name can pass for one. */
export const isAddressLikeName = (name: string): boolean =>
  name.split('.').some(isAddressLikeLabel)
