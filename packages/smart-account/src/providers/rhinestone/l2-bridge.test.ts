import type {
  PreparedTransactionData,
  RhinestoneAccount,
  RhinestoneAccountConfig,
} from '@rhinestone/sdk'
import { BadRequestError } from '@rhinestone/sdk/errors'
import type { Address, Hex } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import {
  L2BridgeExpiredError,
  L2BridgeRejectedError,
  type L2BridgeRoute,
  L2BridgeSubmitError,
  L2BridgeUnconfirmedError,
  l2BridgeMaxFee,
  PERMIT2_ADDRESS,
  quoteL2Bridge,
  RHINESTONE_ACROSS_ARBITER,
  submitL2Bridge,
  validateL2BridgeQuote,
} from './l2-bridge'

const OWNER: Address = '0xd509C22482895c538D302556756630520677b76f'
const HCA: Address = '0xcD5d6F82dbFDfAdf0f944EE7c0AD9eD9c8e4961d'
const REGISTRAR: Address = '0xF633E7FC17E2bBE0D0965D18eC1821DCb754a3d3'
const ATTACKER = '0x6666666666666666666666666666666666666666'
const SOURCE_USDC: Address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const TARGET_USDC: Address = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
const NOW = 1_800_000_000n
const ZERO_VT = `0x${'00'.repeat(32)}`
const COMMIT = {
  to: REGISTRAR,
  value: 0n,
  data: `0xf14fcbc8${'ab'.repeat(32)}` as Hex,
}
const HCA_CONFIG = {
  account: { type: 'hca' },
} as unknown as RhinestoneAccountConfig

const route: L2BridgeRoute = {
  owner: OWNER,
  sourceChain: baseSepolia,
  sourceToken: SOURCE_USDC,
  targetChain: sepolia,
  targetToken: TARGET_USDC,
  amountOut: 5_000_000n,
  recipient: { address: HCA, config: HCA_CONFIG },
  calls: [COMMIT],
}

type SignedOp = { to: string; value: unknown; data: string }

// Shaped like a live Base Sepolia → Sepolia quote; the orchestrator lowercases,
// and sends op values as strings.
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
        intentOp: {
          sponsor: OWNER.toLowerCase(),
          nonce: '77',
          elements: [element],
        },
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
            recipient: HCA.toLowerCase(),
            tokenOut: [received],
            targetChain: 11155111n,
            fillExpiry: NOW + 120n,
          },
          minGas: 0n,
          originOps: { vt: ZERO_VT, ops: [] as unknown[] },
          destOps: {
            vt: ZERO_VT,
            ops: [
              { to: REGISTRAR.toLowerCase(), value: '0', data: COMMIT.data },
            ] as SignedOp[],
          },
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
  it('accepts a route that pays the recipient and runs only its calls', () => {
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
      'payment to the owner instead of the recipient',
      (q) => {
        q.permit.message.mandate.target.recipient = OWNER
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
      'an extra destination operation',
      (q) => {
        q.permit.message.mandate.destOps.ops.push(op)
      },
    ],
    [
      'a missing destination operation',
      (q) => {
        q.permit.message.mandate.destOps.ops = []
      },
    ],
    [
      'a changed destination call',
      (q) => {
        q.permit.message.mandate.destOps.ops[0] = {
          to: REGISTRAR,
          value: '0',
          data: `0xf14fcbc8${'cd'.repeat(32)}`,
        }
      },
    ],
    [
      'a destination call to another contract',
      (q) => {
        q.permit.message.mandate.destOps.ops[0] = { ...op, data: COMMIT.data }
      },
    ],
    [
      'a destination call with value',
      (q) => {
        q.permit.message.mandate.destOps.ops[0] = {
          to: REGISTRAR,
          value: '1',
          data: COMMIT.data,
        }
      },
    ],
    [
      'a destination call with an unreadable value',
      (q) => {
        q.permit.message.mandate.destOps.ops[0] = {
          to: REGISTRAR,
          value: undefined,
          data: COMMIT.data,
        }
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

  it('matches a destination value sent as a bigint', () => {
    expect(
      validate((q) => {
        q.permit.message.mandate.destOps.ops[0] = { ...COMMIT, value: 0n }
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
  it('asks for an unsponsored payment to the recipient, running its calls', async () => {
    const { account } = fakeAccount()
    const result = await quoteL2Bridge(asAccount(account), route, () => NOW)
    expect(result.isOk()).toBe(true)
    expect(account.prepareTransaction).toHaveBeenCalledWith({
      sourceChains: [baseSepolia],
      targetChain: sepolia,
      sourceAssets: { [baseSepolia.id]: [SOURCE_USDC] },
      tokenRequests: [{ address: TARGET_USDC, amount: 5_000_000n }],
      recipient: HCA_CONFIG,
      calls: [COMMIT],
      sponsored: { gas: false, bridging: false, swaps: false },
    })
  })
})

describe('submitL2Bridge', () => {
  const quoted = async (account: ReturnType<typeof fakeAccount>['account']) =>
    (await quoteL2Bridge(asAccount(account), route, () => NOW))._unsafeUnwrap()

  it('submits a timely signature and returns the intent', async () => {
    const { account } = fakeAccount()
    const result = await submitL2Bridge(
      asAccount(account),
      await quoted(account),
      () => NOW + 30n,
    )
    expect(result._unsafeUnwrap()).toMatchObject({ id: 42n })
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

  it('reports a submission the orchestrator refused as not sent', async () => {
    const { account } = fakeAccount()
    const quote = await quoted(account)
    account.submitTransaction.mockRejectedValueOnce(
      new BadRequestError({ statusCode: 400 }),
    )
    const result = await submitL2Bridge(asAccount(account), quote, () => NOW)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(L2BridgeSubmitError)
  })

  // The intent may have been accepted, so it must stay traceable by its nonce.
  it.each([
    ['a lost response', new TypeError('fetch failed')],
    ['a server error', new BadRequestError({ statusCode: 502 })],
  ])('reports %s as unconfirmed, with the intent id', async (_case, cause) => {
    const { account } = fakeAccount()
    const quote = await quoted(account)
    account.submitTransaction.mockRejectedValueOnce(cause)
    const result = await submitL2Bridge(asAccount(account), quote, () => NOW)
    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(L2BridgeUnconfirmedError)
    expect((error as L2BridgeUnconfirmedError).intentId).toBe(77n)
  })
})
