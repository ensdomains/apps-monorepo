import { describe, expect, it } from 'vitest'
import { getWalletIdentityAction } from './walletIdentity'

describe('getWalletIdentityAction', () => {
  it('resets before identifying a different connected wallet', () => {
    expect(
      getWalletIdentityAction({
        isGranted: true,
        isIdentified: true,
        distinctId: '0xaaa',
        address: '0xBBB',
      }),
    ).toEqual({ type: 'replace', address: '0xbbb' })
  })
  it('forgets a persisted wallet when the current app is disconnected', () => {
    expect(
      getWalletIdentityAction({
        isGranted: true,
        isIdentified: true,
        distinctId: '0xaaa',
      }),
    ).toEqual({ type: 'reset' })
  })
  it('does not identify without consent or reset an anonymous visitor', () => {
    expect(
      getWalletIdentityAction({
        isGranted: false,
        isIdentified: false,
        distinctId: 'anonymous',
        address: '0xaaa',
      }),
    ).toEqual({ type: 'none' })
  })
  it('does not reset identity for casing or network changes', () => {
    expect(
      getWalletIdentityAction({
        isGranted: true,
        isIdentified: true,
        distinctId: '0xaaa',
        address: '0xAAA',
      }),
    ).toEqual({ type: 'none' })
  })
})
