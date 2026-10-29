// Labels are ENSIP-15 normalised, so case-sensitive encodings (base58) arrive
// lowercased. The patterns below match the lowercased shape.
const EVM_ADDRESS_LIKE = /^0x[0-9a-f]{38,}$/
const BITCOIN_BECH32_LIKE = /^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{36,62}$/
// Bitcoin legacy (1…/3…) and Solana addresses are base58, 26 to 44 characters
const BASE58_LIKE = /^[1-9a-z]{26,44}$/
const MIN_BASE58_DIGIT_LETTER_SWITCHES = 4

const countDigitLetterSwitches = (label: string): number =>
  [...label].filter(
    (char, index) =>
      index > 0 && /\d/.test(char) !== /\d/.test(label[index - 1] ?? ''),
  ).length

/**
 * Whether a normalised .eth label reads like a wallet address (EVM, Bitcoin
 * or Solana). Such names get handed to victims as if they were the address
 * itself, then resolve to someone else's wallet, so they can't be registered
 * here.
 *
 * Base58 shares its alphabet with ordinary words, so it also needs the digits
 * and letters to be mixed the way an encoded key is, which keeps long names
 * like `thebestcoffeeshopinnewyorkcity2024` registrable.
 */
export const isAddressLikeLabel = (label: string): boolean =>
  EVM_ADDRESS_LIKE.test(label) ||
  BITCOIN_BECH32_LIKE.test(label) ||
  (BASE58_LIKE.test(label) &&
    countDigitLetterSwitches(label) >= MIN_BASE58_DIGIT_LETTER_SWITCHES)
