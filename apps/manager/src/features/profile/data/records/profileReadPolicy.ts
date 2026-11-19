import { PROFILE_TEXT_RECORDS } from '@ens-apps/record-catalog/text'
import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import { STATIC_TEXT_RECORD_KEYS } from './textMetadata'

// Keep the default read small: Coinbase's CCIP-Read gateway rejects a 60-record GET.
export const MAIN_PROFILE_RECORD_KEYS = {
  texts: [
    ...STATIC_TEXT_RECORD_KEYS,
    PROFILE_TEXT_RECORDS.twitter.key,
    PROFILE_TEXT_RECORDS.telegram.key,
    PROFILE_TEXT_RECORDS.farcaster.key,
    PROFILE_TEXT_RECORDS.discord.key,
    PROFILE_TEXT_RECORDS.github.key,
    PROFILE_TEXT_RECORDS.email.key,
    PROFILE_TEXT_RECORDS.phone.key,
    PROFILE_TEXT_RECORDS.location.key,
    PROFILE_TEXT_RECORDS.timezone.key,
    // Newly saved links must be readable before the indexer discovers the key.
    PROFILE_TEXT_RECORDS.links.key,
  ],
  coins: [
    coinNameToTypeMap.eth,
    coinNameToTypeMap.default,
    coinNameToTypeMap.btc,
    coinNameToTypeMap.sol,
    coinNameToTypeMap.op,
    coinNameToTypeMap.arb1,
    coinNameToTypeMap.base,
    coinNameToTypeMap.linea,
    coinNameToTypeMap.scr,
  ],
} as const
