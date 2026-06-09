import type { Address, PublicClient } from 'viem'
import { maxUint256, parseUnits } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import {
  authorizedPaymentAmount,
  predictResolverAddress,
} from './registration.actors'

// predictResolverAddress only uses the public client for the mocked
// `proxyLogic()` read (see the viem/actions mock below); everything else is
// pure CREATE2 math, so a minimal stub is enough.
function mockPublicClient(): PublicClient {
  return { request: vi.fn() } as unknown as PublicClient
}

vi.mock('viem/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem/actions')>()
  return {
    ...actual,
    // proxyLogic() for the live sepolia VerifiableFactory
    readContract: vi
      .fn()
      .mockResolvedValue('0x917C561a74Df398646e06f3FFAA51DB8e8330C5A'),
  }
})

describe('predictResolverAddress', () => {
  // Verified against a real on-chain ProxyDeployed event from the sepolia
  // VerifiableFactory (0xd2a6…6198):
  //   sender  0xe69ee88252f4e42e4643c9502e8d471bd639555a
  //   salt    0x027b1a8af67693ecff927c068279a2a9cd541e7aaa5b7757952639ac3e498ec1
  //   proxy   0x7d8388a3238332541580513bce548e3917b20be5
  it('reproduces the on-chain CREATE2 resolver address', async () => {
    const predicted = await predictResolverAddress({
      publicClient: mockPublicClient(),
      deployer: '0xe69ee88252f4e42e4643c9502e8d471bd639555a' as Address,
      salt: 0x027b1a8af67693ecff927c068279a2a9cd541e7aaa5b7757952639ac3e498ec1n,
    })

    expect(predicted.toLowerCase()).toBe(
      '0x7d8388a3238332541580513bce548e3917b20be5',
    )
  })

  it('is deterministic for the same deployer + salt', async () => {
    const args = {
      publicClient: mockPublicClient(),
      deployer: '0xe69ee88252f4e42e4643c9502e8d471bd639555a' as Address,
      salt: 1234n,
    }
    const a = await predictResolverAddress(args)
    const b = await predictResolverAddress(args)
    expect(a).toBe(b)
  })
})

describe('authorizedPaymentAmount', () => {
  it('authorizes the price plus 10% headroom, not an unlimited allowance', () => {
    const price = parseUnits('5', 6) // 5 USDC
    const amount = authorizedPaymentAmount(price)

    expect(amount).toBe(price + price / 10n)
    // The whole point: scoped, never max.
    expect(amount).toBeLessThan(maxUint256)
    // Covers the price with a bounded buffer (well under 2x).
    expect(amount).toBeGreaterThanOrEqual(price)
    expect(amount).toBeLessThan(price * 2n)
  })

  it('handles a zero price', () => {
    expect(authorizedPaymentAmount(0n)).toBe(0n)
  })
})
