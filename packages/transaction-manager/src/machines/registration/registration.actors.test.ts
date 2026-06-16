import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { maxUint256, parseUnits } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import type {
  EOASigner,
  RhinestoneSigner,
  Signer,
} from '../../types/signer.types'
import { type Call, getPrimaryCall } from '../../types/transaction.types'
import {
  authorizedPaymentAmount,
  createTransactionRequest,
  predictResolverAddress,
} from './registration.actors'

const FROM = '0xF00000000000000000000000000000000000000F' as Address
const eoaSigner = { type: 'eoa' } as unknown as Signer
const rhinestoneSigner = { type: 'rhinestone' } as unknown as Signer

const permitCall: Call = {
  to: '0x1111111111111111111111111111111111111111' as Address,
  data: '0xd505accf' as Hex,
  value: 0n,
}
const registerCall: Call = {
  to: '0x2222222222222222222222222222222222222222' as Address,
  data: '0x12345678' as Hex,
  value: 7n,
}

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

describe('createTransactionRequest', () => {
  it('derives EOA top-level fields from the single call', () => {
    const request = createTransactionRequest({
      signer: eoaSigner,
      from: FROM,
      chainId: 11155111,
      calls: [registerCall],
    })

    expect(request.type).toBe('eoa')
    if (request.type !== 'eoa') throw new Error('expected eoa request')
    // Top-level call data is exactly the (only) call — no divergent copy.
    expect(request.to).toBe(registerCall.to)
    expect(request.data).toBe(registerCall.data)
    expect(request.value).toBe(registerCall.value)
  })

  it('stores calls verbatim for a rhinestone intent with no top-level copy', () => {
    const calls = [permitCall, registerCall]
    const request = createTransactionRequest({
      signer: rhinestoneSigner,
      from: FROM,
      chainId: 11155111,
      calls,
    })

    expect(request.type).toBe('rhinestone-intent')
    if (request.type !== 'rhinestone-intent') {
      throw new Error('expected rhinestone-intent request')
    }
    // calls is the single source of truth.
    expect(request.rhinestoneParams.calls).toEqual(calls)
    // There is no top-level call data that could diverge from calls.
    expect('to' in request).toBe(false)
    expect('data' in request).toBe(false)
    expect('value' in request).toBe(false)
    // getPrimaryCall resolves the representative call from calls[0].
    expect(getPrimaryCall(request)).toEqual({
      to: permitCall.to,
      data: permitCall.data,
      value: permitCall.value,
    })
  })

  it('rejects a multi-call batch for an EOA signer', () => {
    expect(() =>
      createTransactionRequest({
        signer: eoaSigner,
        from: FROM,
        chainId: 11155111,
        calls: [permitCall, registerCall],
      }),
    ).toThrow(/single call/i)
  })

  it('rejects an empty calls array', () => {
    expect(() =>
      createTransactionRequest({
        signer: rhinestoneSigner,
        from: FROM,
        chainId: 11155111,
        calls: [],
      }),
    ).toThrow(/at least one call/i)
  })
})

describe('createTransactionRequest (cross-chain params)', () => {
  const rhinestoneSigner = {
    type: 'rhinestone',
    account: {} as never,
    config: { rhinestoneApiKey: 'test' },
  } as unknown as RhinestoneSigner

  const baseParams = {
    from: '0x1111111111111111111111111111111111111111' as Address,
    to: '0x2222222222222222222222222222222222222222' as Address,
    data: '0x' as const,
    value: 0n,
    chainId: 11155111,
    calls: [
      {
        to: '0x2222222222222222222222222222222222222222' as Address,
        data: '0x' as const,
        value: 0n,
      },
    ],
  }

  it('omits cross-chain fields for a same-chain rhinestone intent', () => {
    const request = createTransactionRequest({
      signer: rhinestoneSigner,
      ...baseParams,
    })

    expect(request.type).toBe('rhinestone-intent')
    if (request.type !== 'rhinestone-intent') throw new Error('unreachable')
    expect(request.rhinestoneParams.tokenRequests).toBeUndefined()
    expect(request.rhinestoneParams.sourceChains).toBeUndefined()
    expect(request.rhinestoneParams.sourceAssets).toBeUndefined()
  })

  it('forwards tokenRequests, sourceChains and sourceAssets when provided', () => {
    const destToken = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address
    const srcToken = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address
    const amount = parseUnits('5.5', 6)

    const request = createTransactionRequest({
      signer: rhinestoneSigner,
      ...baseParams,
      tokenRequests: [{ address: destToken, amount }],
      sourceChains: [84532],
      sourceAssets: [{ chainId: 84532, address: srcToken }],
    })

    if (request.type !== 'rhinestone-intent') throw new Error('unreachable')
    expect(request.rhinestoneParams.tokenRequests).toEqual([
      { address: destToken, amount },
    ])
    expect(request.rhinestoneParams.sourceChains).toEqual([84532])
    expect(request.rhinestoneParams.sourceAssets).toEqual([
      { chainId: 84532, address: srcToken },
    ])
  })

  it('never attaches cross-chain fields to an EOA request', () => {
    const eoaSigner: EOASigner = {
      type: 'eoa',
      walletClient: {} as WalletClient,
    }

    const request = createTransactionRequest({
      signer: eoaSigner,
      ...baseParams,
      tokenRequests: [
        {
          address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
          amount: 1n,
        },
      ],
      sourceChains: [84532],
    })

    expect(request.type).toBe('eoa')
    expect('rhinestoneParams' in request).toBe(false)
  })
})
