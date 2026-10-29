// Labels are ENSIP-15 normalised, so case-sensitive encodings (base58) arrive
// lowercased. The patterns below match the lowercased shape.
const EVM_ADDRESS_LIKE = /^0x[0-9a-f]{38,}$/
const BITCOIN_BECH32_LIKE = /^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{36,62}$/
// Base58: Bitcoin legacy addresses start with 1 or 3 and run 26 to 35
// characters; Solana keys run 32 to 44
const BITCOIN_LEGACY_LIKE = /^[13][1-9a-z]{25,34}$/
const SOLANA_LIKE = /^[1-9a-z]{32,44}$/
const MIN_BASE58_DIGIT_LETTER_SWITCHES = 4
const MIN_BASE58_DIGIT_SHARE = 1 / 3

const countDigitLetterSwitches = (label: string): number =>
  [...label].filter(
    (char, index) =>
      index > 0 && /\d/.test(char) !== /\d/.test(label[index - 1] ?? ''),
  ).length

const getDigitShare = (label: string): number =>
  [...label].filter((char) => /\d/.test(char)).length / label.length

const looksLikeBase58Key = (label: string): boolean =>
  countDigitLetterSwitches(label) >= MIN_BASE58_DIGIT_LETTER_SWITCHES ||
  getDigitShare(label) >= MIN_BASE58_DIGIT_SHARE

/**
 * Whether a normalised .eth label reads like a wallet address (EVM, Bitcoin
 * or Solana). Such names get handed to victims as if they were the address
 * itself, then resolve to someone else's wallet, so they can't be registered
 * here.
 *
 * Base58 shares its alphabet with ordinary words, so it also needs the digits
 * and letters mixed the way an encoded key is, or digits clustered the way
 * vanity and program addresses are (`So111…112`). That keeps long names like
 * `summerroadtripwithallmyfriends1999` registrable.
 */
export const isAddressLikeLabel = (label: string): boolean =>
  EVM_ADDRESS_LIKE.test(label) ||
  BITCOIN_BECH32_LIKE.test(label) ||
  ((BITCOIN_LEGACY_LIKE.test(label) || SOLANA_LIKE.test(label)) &&
    looksLikeBase58Key(label))
