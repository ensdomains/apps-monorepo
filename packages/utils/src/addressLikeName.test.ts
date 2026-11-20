import { describe, expect, it } from 'vitest'
import { isAddressLikeName } from './addressLikeName'

const VITALIK = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'

describe('isAddressLikeName', () => {
  it.each([
    ['an EVM address', `${VITALIK}.eth`],
    ['an EVM address missing a character', `${VITALIK.slice(0, -1)}.eth`],
    [
      'an EVM address with its middle cut out',
      `${VITALIK.slice(0, 10)}${VITALIK.slice(-12)}.eth`,
    ],
    ['a 32-byte 0x key (Sui, Aptos)', `0x${'ab12'.repeat(16)}.eth`],
    [
      'a checksummed EVM address',
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045.eth',
    ],
    [
      'a Bitcoin SegWit address',
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq.eth',
    ],
    [
      'a Bitcoin Taproot address',
      'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297.eth',
    ],
    ['a Bitcoin P2PKH address', '1a1zp1ep5qgefi2dmptftl5slmv7divfna.eth'],
    ['a Bitcoin P2SH address', '3j98t1wpez73cnmqviecrnyiwrnqrhwnly.eth'],
    ['a short Bitcoin P2PKH address', '1111111111111111111114olvt2.eth'],
    [
      'a Bitcoin P2PKH address with few digits',
      '1LfdMrcyu1TfXrVTKoEAtYMRdgkySWFNSk.eth',
    ],
    [
      'a Bitcoin P2PKH address with almost no digits',
      '1hnjkwjimlixzzbgyvawefejsfbkbgkzq3.eth',
    ],
    ['a Solana address', '9wzdxwbbmkg8ztbnmquxvqrayrzzdsgydlvl9zytawwm.eth'],
    [
      'a Solana address as copied, before normalisation',
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM.eth',
    ],
    [
      'a Solana address with few digits',
      '4CCfxWgJFwbMqiJdK8bexFCvJhoPJgFLwXZBQCWgjutS.eth',
    ],
    [
      'a Solana address with almost no digits',
      'bbvcvtbhgumnlmwlbymfesxdll73pdtrhhpxcyxrtyyo.eth',
    ],
    [
      'a Solana address with clustered digits',
      'so11111111111111111111111111111111111111112.eth',
    ],
    ['the Solana system program', `${'1'.repeat(32)}.eth`],
    [
      'a name as long as a Solana address, which it spells with `L`',
      'thisisaverylongnamethatsomeonemightregister.eth',
    ],
    ['an address-like subname', `${VITALIK}.base.eth`],
    ['a name under an address-like parent', `pay.${VITALIK}.eth`],
    ['an address-like DNS name', `${VITALIK}.xyz`],
  ])('flags %s', (_case, name) => {
    expect(isAddressLikeName(name)).toBe(true)
  })

  it.each([
    ['a plain name', 'vitalik.eth'],
    ['a short 0x vanity name', '0xvitalik.eth'],
    ['a short hex name', '0xdeadbeef.eth'],
    ['a long name ending in a year', 'thebestcoffeeshopinnewyorkcity2024.eth'],
    ['a name of words and digits', 'hellomr1solanahowareyou2thankyou.eth'],
    [
      'a Solana-length name with a year',
      'summerroadtripwithallmyfriends1999.eth',
    ],
    ['a short mixed name', 'satoshi21million4ever2moon.eth'],
    [
      'a mixed name too short for Solana and not 1- or 3-prefixed',
      'hello1world2hello3world4abc.eth',
    ],
    [
      'a name starting with bc1 that is not bech32',
      'bc1isthebestnameforbitcoinfansallaroundyou.eth',
    ],
    ['an emoji name', '👍👍👍.eth'],
  ])('allows %s', (_case, name) => {
    expect(isAddressLikeName(name)).toBe(false)
  })
})
