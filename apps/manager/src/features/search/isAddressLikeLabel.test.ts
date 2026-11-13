import { describe, expect, it } from 'vitest'
import { isAddressLikeLabel } from './isAddressLikeLabel'

describe('isAddressLikeLabel', () => {
  it.each([
    ['an EVM address', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'],
    [
      'an EVM address missing a character',
      '0xd8da6bf26964af9d7eed9e03e53415d37aa9604',
    ],
    ['a 32-byte 0x key (Sui, Aptos)', `0x${'ab12'.repeat(16)}`],
    ['a Bitcoin SegWit address', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'],
    [
      'a Bitcoin Taproot address',
      'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
    ],
    ['a Bitcoin P2PKH address', '1a1zp1ep5qgefi2dmptftl5slmv7divfna'],
    ['a Bitcoin P2SH address', '3j98t1wpez73cnmqviecrnyiwrnqrhwnly'],
    [
      'a Bitcoin P2PKH address shorter than a Solana key',
      '1boatslrhzbwx9t7e8m3vgnbmqn6p4',
    ],
    ['a Solana address', '9wzdxwbbmkg8ztbnmquxvqrayrzzdsgydlvl9zytawwm'],
    ['another Solana address', '7xkxtg2cw87d97txjsdpbd5jbkhetqa83tzrujosgasu'],
    [
      'a Solana address with clustered digits',
      'so11111111111111111111111111111111111111112',
    ],
    ['the Solana system program', '11111111111111111111111111111111'],
    ['a Solana vanity address', 'abcdefghjkmnp1234567892222333344445555'],
  ])('flags %s', (_case, label) => {
    expect(isAddressLikeLabel(label)).toBe(true)
  })

  it.each([
    ['a plain word', 'vitalik'],
    ['a short 0x vanity name', '0xvitalik'],
    ['a short hex name', '0xdeadbeef'],
    ['a long name ending in a year', 'thebestcoffeeshopinnewyorkcity2024'],
    ['a long all-letter name', 'thisisaverylongnamethatsomeonemightregister'],
    [
      'a Solana-length base58-shaped name with a year',
      'summerroadtripwithallmyfriends1999',
    ],
    [
      'a short mixed name that is not a Solana key',
      'satoshi21million4ever2moon',
    ],
    [
      'a mixed name too short for Solana and not 1/3-prefixed',
      'hello1world2hello3world4abc',
    ],
    [
      'a name starting with bc1 that is not bech32',
      'bc1isthebestnameforbitcoinfans',
    ],
    ['an emoji name', '👍👍👍'],
  ])('allows %s', (_case, label) => {
    expect(isAddressLikeLabel(label)).toBe(false)
  })
})
