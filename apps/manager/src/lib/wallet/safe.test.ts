import { describe, expect, it } from 'vitest'
import type { Connector } from 'wagmi'
import { checkIsSafeWallet } from './safe'

const wcConnector = (metadata?: { name: string; url: string }) =>
  ({
    type: 'walletConnect',
    getProvider: async () => ({
      session: metadata ? { peer: { metadata } } : undefined,
    }),
  }) as unknown as Connector

describe('checkIsSafeWallet', () => {
  it('is false without a connector', async () => {
    expect(await checkIsSafeWallet(undefined)).toBe(false)
  })

  it('is false for an injected wallet', async () => {
    const injected = { type: 'injected' } as unknown as Connector
    expect(await checkIsSafeWallet(injected)).toBe(false)
  })

  it('is false for WalletConnect without a session', async () => {
    expect(await checkIsSafeWallet(wcConnector())).toBe(false)
  })

  it('is true for a Safe{Wallet} WalletConnect peer', async () => {
    const connector = wcConnector({
      name: 'Safe{Wallet}',
      url: 'https://app.safe.global/',
    })
    expect(await checkIsSafeWallet(connector)).toBe(true)
  })

  it('is false for another WalletConnect peer', async () => {
    const connector = wcConnector({
      name: 'Rainbow',
      url: 'https://rainbow.me',
    })
    expect(await checkIsSafeWallet(connector)).toBe(false)
  })

  it('is false for a Safe-named peer on another origin', async () => {
    const connector = wcConnector({
      name: 'Safe{Wallet}',
      url: 'https://app.safe.global.evil.example',
    })
    expect(await checkIsSafeWallet(connector)).toBe(false)
  })
})
