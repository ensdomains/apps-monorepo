import type { Address, PublicClient } from 'viem'
import { describe, expect, it } from 'vitest'
import { sepoliaWithEns } from '@/lib/wagmi'
import { buildRenewIntent } from './useRenewalTransactions'

const FROM = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const USDC = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address

// `renewNameWriteParameters` is a pure encode — it only reads chain contract
// addresses off the client.
const publicClient = { chain: sepoliaWithEns } as unknown as PublicClient

const renewParams = (name: string) => ({
  name,
  duration: 31_536_000,
  tokenAddress: USDC,
  from: FROM,
  publicClient,
  isV2: true,
})

describe('buildRenewIntent', () => {
  // The label the renewer is called with comes from `getLabel`, which
  // normalises: without this refusal, renewing `ALICE.eth` would push
  // `alice.eth`'s expiry — a different name that someone else may own. The UI
  // gate lives in `isExtendable2LD`; this is the same gate at signing time, and
  // it covers the modal's gas estimate as well as the submit.
  it.each([
    ['an uppercase label', 'ALICE.eth'],
    ['a fullwidth homoglyph label', 'ａlice.eth'],
    ['an uppercase TLD', 'alice.ETH'],
  ])('refuses %s', (_case, name) => {
    expect(() => buildRenewIntent(renewParams(name))).toThrow(/normalized form/)
  })

  it('builds the intent for the canonical spelling', () => {
    const intent = buildRenewIntent(renewParams('alice.eth'))
    expect(intent).toBeDefined()
  })
})
