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
    ['a Solana address', '9wzdxwbbmkg8ztbnmquxvqrayrzzdsgydlvl9zytawwm'],
    ['another Solana address', '7xkxtg2cw87d97txjsdpbd5jbkhetqa83tzrujosgasu'],
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
      'a name starting with bc1 that is not bech32',
      'bc1isthebestnameforbitcoinfans',
    ],
    ['an emoji name', '👍👍👍'],
  ])('allows %s', (_case, label) => {
    expect(isAddressLikeLabel(label)).toBe(false)
  })
})
