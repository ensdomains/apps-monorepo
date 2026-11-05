import type { Signer } from '@ens-apps/transaction-manager'
import type { WalletClient } from 'viem'
import { describe, expect, it } from 'vitest'
import type { Connector } from 'wagmi'
import {
  getRenewalPaymentRoute,
  resolveRenewalSigner,
} from './renewalPaymentRoute'

describe('getRenewalPaymentRoute', () => {
  it('renews a smart account by intent', () => {
    expect(getRenewalPaymentRoute({ type: 'rhinestone' } as Signer)).toBe(
      'intent',
    )
  })

  it('keeps EOA-only mode on the wallet route', () => {
    expect(getRenewalPaymentRoute({ type: 'eoa' } as Signer)).toBe('wallet')
  })

  it('has no route while the signer initializes, rather than the wallet', () => {
    expect(getRenewalPaymentRoute(null)).toBeNull()
    expect(getRenewalPaymentRoute(undefined)).toBeNull()
  })
})

describe('resolveRenewalSigner', () => {
  const walletClient = {} as WalletClient
  const connector = { id: 'walletConnect' } as Connector
  const hcaSigner = { type: 'rhinestone' } as Signer

  const resolve = (
    overrides: Partial<Parameters<typeof resolveRenewalSigner>[0]>,
  ) =>
    resolveRenewalSigner({
      signer: hcaSigner,
      walletClient,
      connector,
      isSafeWallet: false,
      ...overrides,
    })

  it('renews a Safe{Wallet} from the wallet, with the connector that settles its executions', () => {
    expect(resolve({ isSafeWallet: true })).toEqual({
      type: 'eoa',
      walletClient,
      walletId: 'walletConnect',
      connector,
    })
  })

  it("keeps the account's signer for any other wallet", () => {
    expect(resolve({ isSafeWallet: false })).toBe(hcaSigner)
  })

  it.each([
    {
      scenario: 'the Safe check is pending',
      isSafeWallet: undefined,
      client: walletClient,
    },
    {
      scenario: 'a Safe has no wallet client',
      isSafeWallet: true,
      client: null,
    },
  ])('has no signer while $scenario', ({ isSafeWallet, client }) => {
    expect(resolve({ isSafeWallet, walletClient: client })).toBeNull()
  })
})
