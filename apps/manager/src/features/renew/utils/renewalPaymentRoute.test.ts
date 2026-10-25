import type { Signer } from '@ens-apps/transaction-manager'
import { describe, expect, it } from 'vitest'
import { getRenewalPaymentRoute } from './renewalPaymentRoute'

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
