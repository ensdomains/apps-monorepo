import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  getWalletIdentityAction,
  hasMatchingWalletIdentity,
} from './walletIdentity'

describe('getWalletIdentityAction', () => {
  it('resets before identifying a different connected wallet', () => {
    expect(
      getWalletIdentityAction({
        isGranted: true,
        isIdentified: true,
        distinctId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    ).toEqual({
      type: 'replace',
      address: getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
    })
  })
  it('forgets a persisted wallet when the current app is disconnected', () => {
    expect(
      getWalletIdentityAction({
        isGranted: true,
        isIdentified: true,
        distinctId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).toEqual({ type: 'reset' })
  })
  it('does not identify without consent or reset an anonymous visitor', () => {
    expect(
      getWalletIdentityAction({
        isGranted: false,
        isIdentified: false,
        distinctId: 'anonymous',
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).toEqual({ type: 'none' })
  })
  it('does not reset identity for casing or network changes', () => {
    expect(
      getWalletIdentityAction({
        isGranted: true,
        isIdentified: true,
        distinctId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      }),
    ).toEqual({ type: 'none' })
  })
})

it('retains an already identified checksummed wallet and accepts its captures', () => {
  const wallet = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
  const identity = getAddress(wallet)
  expect(
    getWalletIdentityAction({
      isGranted: true,
      isIdentified: true,
      distinctId: identity,
      address: wallet,
    }),
  ).toEqual({ type: 'none' })
  expect(hasMatchingWalletIdentity(wallet, identity)).toBe(true)
})
