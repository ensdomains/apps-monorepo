import type { RhinestoneSigner } from '@ens-apps/transaction-manager'
import { describe, expect, it } from 'vitest'
import { resolvePrimaryNameHcaSigner } from './primaryNameSigner'

const hcaSigner = { type: 'rhinestone' } as RhinestoneSigner

describe('resolvePrimaryNameHcaSigner', () => {
  it.each([
    {
      when: 'uses the HCA signer for another wallet',
      signer: hcaSigner,
      isSafeWallet: false,
      expected: hcaSigner,
    },
    {
      when: 'skips the HCA for a Safe{Wallet}, which cannot sign its intent',
      signer: hcaSigner,
      isSafeWallet: true,
      expected: undefined,
    },
    {
      when: 'skips the HCA before a signer loads',
      signer: null,
      isSafeWallet: false,
      expected: undefined,
    },
  ])('$when', ({ signer, isSafeWallet, expected }) => {
    expect(resolvePrimaryNameHcaSigner({ signer, isSafeWallet })).toBe(expected)
  })
})
