import { describe, expect, it } from 'vitest'
import { isAddressLikeEthName } from './addressLikeName'

describe('isAddressLikeEthName', () => {
  it.each([
    ['an EVM', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth'],
    ['a Bitcoin', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq.eth'],
    ['a Solana', '9wzdxwbbmkg8ztbnmquxvqrayrzzdsgydlvl9zytawwm.eth'],
  ])('warns on a .eth name that reads like %s address', (_case, name) => {
    expect(isAddressLikeEthName(name)).toBe(true)
  })

  it.each([
    ['an ordinary name', 'vitalik.eth'],
    ['a long mixed name', 'satoshi21million4ever2moon.eth'],
    [
      'an address-like label outside .eth',
      '0xd8da6bf26964af9d7eed9e03e53415d37aa96045.xyz',
    ],
    [
      'a subname under an address-like 2LD',
      'pay.0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth',
    ],
  ])('does not warn on %s', (_case, name) => {
    expect(isAddressLikeEthName(name)).toBe(false)
  })
})
