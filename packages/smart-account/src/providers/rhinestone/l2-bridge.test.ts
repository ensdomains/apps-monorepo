import type {
  PreparedTransactionData,
  RhinestoneAccount,
} from '@rhinestone/sdk'
import type { Address } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import {
  L2BridgeExpiredError,
  L2BridgeRejectedError,
  type L2BridgeRoute,
  L2BridgeSubmitError,
  l2BridgeMaxFee,
  PERMIT2_ADDRESS,
  quoteL2Bridge,
  RHINESTONE_ACROSS_ARBITER,
  submitL2Bridge,
  validateL2BridgeQuote,
} from './l2-bridge'

const OWNER: Address = '0xd509C22482895c538D302556756630520677b76f'
const ATTACKER = '0x6666666666666666666666666666666666666666'
const SOURCE_USDC: Address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const TARGET_USDC: Address = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
const NOW = 1_800_000_000n
const ZERO_VT = `0x${'00'.repeat(32)}`

const route: L2BridgeRoute = {
  owner: OWNER,
  sourceChain: baseSepolia,
  sourceToken: SOURCE_USDC,
  targetChain: sepolia,
  targetToken: TARGET_USDC,
  amountOut: 5_000_000n,
}

// Shaped like a live Base Sepolia → Sepolia quote; the orchestrator lowercases.
const baseQuote = () => {
  const element = {
    chainId: '84532',
    arbiter: RHINESTONE_ACROSS_ARBITER.toLowerCase(),
    mandate: {
      qualifier: {
        settlementContext: {
          settlementLayer: 'ACROSS',
          fundingMethod: 'PERMIT2',
          using7579: false,
        },
      },
    },
  }
  const permitted = { token: SOURCE_USDC.toLowerCase(), amount: 5_012_573n }
  const received = { token: TARGET_USDC.toLowerCase(), amount: 5_000_000n }
  return {
    element,
    permitted,
    received,
    prepared: {
      intentRoute: {
        intentOp: { sponsor: OWNER.toLowerCase(), elements: [element] },
        tokenRequirements: {
          84532: {
            [SOURCE_USDC.toLowerCase()]: {
              type: 'approval',
              amount: '5012573',
              spender: PERMIT2_ADDRESS.toLowerCase(),
            },
          },
        } as Record<number, Record<string, unknown>>,
      },
    },
    permit: {
      domain: {
        name: 'Permit2',
        chainId: 84532,
        verifyingContract: PERMIT2_ADDRESS,
      },
      primaryType: 'PermitBatchWitnessTransferFrom',
      types: {},
      message: {
        permitted: [permitted],
        spender: RHINESTONE_ACROSS_ARBITER.toLowerCase(),
        nonce: 1n,
        deadline: NOW + 120n,
        mandate: {
          target: {
            recipient: OWNER.toLowerCase(),
            tokenOut: [received],
            targetChain: 11155111n,
            fillExpiry: NOW + 120n,
          },
          minGas: 0n,
          originOps: { vt: ZERO_VT, ops: [] as unknown[] },
          destOps: { vt: ZERO_VT, ops: [] as unknown[] },
          q: ZERO_VT,
        },
      },
    },
  }
}

type Quote = ReturnType<typeof baseQuote>

const validate = (edit: (quote: Quote) => void = () => {}) => {
  const quote = baseQuote()
  edit(quote)
  return validateL2BridgeQuote({
    route,
    prepared: quote.prepared as unknown as PreparedTransactionData,
    messages: {
      origin: [quote.permit],
      destination: quote.permit,
    } as never,
    now: NOW,
  })
}

const op = { to: ATTACKER, value: 0n, data: '0x' }

describe('validateL2BridgeQuote', () => {
  it('accepts a route that only moves USDC between the owner’s wallets', () => {
    const result = validate()
    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toMatchObject({
      amountIn: 5_012_573n,
      amountReceived: 5_000_000n,
      deadline: NOW + 120n,
    })
  })

  it.each<[string, (quote: Quote) => void]>([
    [
      'another sponsor',
      (q) => {
        q.prepared.intentRoute.intentOp.sponsor = ATTACKER
      },
    ],
    [
      'another source chain',
      (q) => {
        q.element.chainId = '421614'
      },
    ],
    [
      'a second element',
      (q) => {
        q.prepared.intentRoute.intentOp.elements.push(q.element)
      },
    ],
    [
      'compact funding',
      (q) => {
        q.element.mandate.qualifier.settlementContext.fundingMethod = 'COMPACT'
      },
    ],
    [
      'intent-executor settlement',
      (q) => {
        q.element.mandate.qualifier.settlementContext.settlementLayer =
          'INTENT_EXECUTOR'
      },
    ],
    [
      'another primary type',
      (q) => {
        q.permit.primaryType = 'PermitWitnessTransferFrom'
      },
    ],
    [
      'a domain on another chain',
      (q) => {
        q.permit.domain.chainId = 11155111
      },
    ],
    [
      'a non-canonical Permit2',
      (q) => {
        q.permit.domain.verifyingContract = ATTACKER
      },
    ],
    [
      'an expired permit',
      (q) => {
        q.permit.message.deadline = NOW
      },
    ],
    [
      'a long-lived permit',
      (q) => {
        q.permit.message.deadline = NOW + 601n
      },
    ],
    [
      'another spender',
      (q) => {
        q.permit.message.spender = ATTACKER
      },
    ],
    [
      'another source token',
      (q) => {
        q.permitted.token = ATTACKER
      },
    ],
    [
      'a second permitted token',
      (q) => {
        q.permit.message.permitted.push({ token: ATTACKER, amount: 1n })
      },
    ],
    [
      'a fee over the cap',
      (q) => {
        q.permitted.amount = 6_000_001n
      },
    ],
    [
      'another recipient',
      (q) => {
        q.permit.message.mandate.target.recipient = ATTACKER
      },
    ],
    [
      'another target chain',
      (q) => {
        q.permit.message.mandate.target.targetChain = 1n
      },
    ],
    [
      'another target token',
      (q) => {
        q.received.token = ATTACKER
      },
    ],
    [
      'a short delivery',
      (q) => {
        q.received.amount = 4_999_999n
      },
    ],
    [
      'a second delivered token',
      (q) => {
        q.permit.message.mandate.target.tokenOut.push({
          token: ATTACKER,
          amount: 1n,
        })
      },
    ],
    [
      'an origin operation',
      (q) => {
        q.permit.message.mandate.originOps.ops.push(op)
      },
    ],
    [
      'a destination operation',
      (q) => {
        q.permit.message.mandate.destOps.ops.push(op)
      },
    ],
    [
      'an approval to another spender',
      (q) => {
        q.prepared.intentRoute.tokenRequirements = {
          84532: {
            [SOURCE_USDC]: { type: 'approval', amount: '1', spender: ATTACKER },
          },
        }
      },
    ],
    [
      'a wrap',
      (q) => {
        q.prepared.intentRoute.tokenRequirements = {
          84532: { [SOURCE_USDC]: { type: 'wrap', amount: '1' } },
        }
      },
    ],
    [
      'an approval on another chain',
      (q) => {
        q.prepared.intentRoute.tokenRequirements = {
          1: {
            [SOURCE_USDC]: {
              type: 'approval',
              amount: '1',
              spender: PERMIT2_ADDRESS,
            },
          },
        }
      },
    ],
  ])('rejects %s', (_, edit) => {
    expect(validate(edit)._unsafeUnwrapErr()).toBeInstanceOf(
      L2BridgeRejectedError,
    )
  })

  it('allows a route that needs no approval', () => {
    expect(
      validate((q) => {
        q.prepared.intentRoute.tokenRequirements = {}
      }).isOk(),
    ).toBe(true)
  })
})

describe('l2BridgeMaxFee', () => {
  it('is 2% of the amount, at least 1 USDC', () => {
    expect(l2BridgeMaxFee(5_000_000n)).toBe(1_000_000n)
    expect(l2BridgeMaxFee(100_000_000n)).toBe(2_000_000n)
  })
})

const fakeAccount = () => {
  const quote = baseQuote()
  return {
    quote,
    account: {
      prepareTransaction: vi.fn(async () => quote.prepared),
      getTransactionMessages: vi.fn(() => ({
        origin: [quote.permit],
        destination: quote.permit,
      })),
      signTransaction: vi.fn(async (prepared: object) => ({
        ...prepared,
        originSignatures: ['0x01'],
        destinationSignature: '0x01',
      })),
      submitTransaction: vi.fn(async () => ({
        type: 'intent',
        id: 42n,
        targetChain: sepolia.id,
      })),
    },
  }
}
const asAccount = (account: object) => account as unknown as RhinestoneAccount

describe('quoteL2Bridge', () => {
  it('asks for an unsponsored bridge of the source token to the owner', async () => {
    const { account } = fakeAccount()
    const result = await quoteL2Bridge(asAccount(account), route, () => NOW)
    expect(result.isOk()).toBe(true)
    expect(account.prepareTransaction).toHaveBeenCalledWith({
      sourceChains: [baseSepolia],
      targetChain: sepolia,
      sourceAssets: { [baseSepolia.id]: [SOURCE_USDC] },
      tokenRequests: [{ address: TARGET_USDC, amount: 5_000_000n }],
      sponsored: { gas: false, bridging: false, swaps: false },
    })
  })

  it('refuses an amount below the minimum without quoting', async () => {
    const { account } = fakeAccount()
    const result = await quoteL2Bridge(
      asAccount(account),
      { ...route, amountOut: 999_999n },
      () => NOW,
    )
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(L2BridgeRejectedError)
    expect(account.prepareTransaction).not.toHaveBeenCalled()
  })
})

describe('submitL2Bridge', () => {
  const quoted = async (account: ReturnType<typeof fakeAccount>['account']) =>
    (await quoteL2Bridge(asAccount(account), route, () => NOW))._unsafeUnwrap()

  it('submits a timely signature and returns the intent id', async () => {
    const { account } = fakeAccount()
    const result = await submitL2Bridge(
      asAccount(account),
      await quoted(account),
      () => NOW + 30n,
    )
    expect(result._unsafeUnwrap()).toBe(42n)
  })

  it('does not submit a signature that lands near the deadline', async () => {
    const { account } = fakeAccount()
    const result = await submitL2Bridge(
      asAccount(account),
      await quoted(account),
      () => NOW + 111n,
    )
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(L2BridgeExpiredError)
    expect(account.submitTransaction).not.toHaveBeenCalled()
  })

  it('reports a declined signature without submitting', async () => {
    const { account } = fakeAccount()
    const quote = await quoted(account)
    account.signTransaction.mockRejectedValueOnce(new Error('User rejected'))
    const result = await submitL2Bridge(asAccount(account), quote, () => NOW)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(L2BridgeSubmitError)
    expect(account.submitTransaction).not.toHaveBeenCalled()
  })
})
