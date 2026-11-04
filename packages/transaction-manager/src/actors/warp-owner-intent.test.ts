import {
  buildStandaloneAccountConfig,
  getDestinationContracts,
} from '@ens-apps/smart-account'
import {
  type IntentOp,
  type RhinestoneAccount,
  RhinestoneSDK,
} from '@rhinestone/sdk'
import { encodeFunctionData, erc20Abi, zeroAddress, zeroHash } from 'viem'
import { toAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import type {
  Call,
  RhinestoneTransactionRequest,
} from '../types/transaction.types'
import {
  checkOwnerIntentRoute,
  OwnerIntentValidationError,
} from './warp-owner-intent'

const HCA = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x2222222222222222222222222222222222222222'
const REGISTRAR = '0x3333333333333333333333333333333333333333'
const CALLS = [
  { to: TOKEN, value: 0n, data: '0xdeadbeef' },
  { to: REGISTRAR, value: 0n, data: '0xabcdef01' },
] as const
const REQUEST: RhinestoneTransactionRequest = {
  type: 'rhinestone-intent',
  from: HCA,
  chainId: 1,
  rhinestoneParams: {
    calls: CALLS,
    ownerIntentLimits: {
      refundToken: TOKEN,
      refundCaps: {
        maxRefundExchangeRate: 3_000_000_000n,
        maxRefundGasOverhead: 500_000n,
        maxRefundAmount: 1_000_000n,
      },
    },
  },
}
type Element = IntentOp['elements'][number]
type Mandate = Element['mandate']
type Context = Mandate['qualifier']['settlementContext']

const makeRoute = (
  input: {
    readonly element?: Partial<Element>
    readonly mandate?: Partial<Mandate>
    readonly context?: Partial<Context>
    readonly refund?: Partial<NonNullable<Context['gasRefund']>>
  } = {},
) => ({
  intentOp: {
    sponsor: HCA,
    elements: [
      {
        chainId: '1',
        idsAndAmounts: [],
        spendTokens: [],
        ...input.element,
        mandate: {
          recipient: HCA,
          destinationChainId: '1',
          tokenOut: [],
          preClaimOps: { vt: zeroHash, ops: [] },
          destinationOps: { vt: `0x0201${'00'.repeat(30)}`, ops: CALLS },
          ...input.mandate,
          qualifier: {
            settlementContext: {
              settlementLayer: 'INTENT_EXECUTOR',
              fundingMethod: 'NO_FUNDING',
              using7579: true,
              ...input.context,
              gasRefund: {
                token: TOKEN,
                exchangeRate: 3_000_000_000n,
                overhead: (1_000_000n << 128n) | 500_000n,
                ...input.refund,
              },
            },
          },
        },
      },
    ],
  },
})

const withCalls = (ops: readonly Call[]) =>
  makeRoute({
    mandate: {
      destinationOps: { vt: `0x0201${'00'.repeat(30)}`, ops: [...ops] },
    },
  })

const makeLiveOwnerQuote = async () => {
  const usdc = getDestinationContracts(1).usdc
  const request: RhinestoneTransactionRequest = {
    ...REQUEST,
    rhinestoneParams: {
      calls: [{ ...CALLS[0], to: usdc }, CALLS[1]],
      ownerIntentLimits: {
        refundToken: usdc,
        refundCaps: REQUEST.rhinestoneParams.ownerIntentLimits?.refundCaps ?? {
          maxRefundExchangeRate: 3_000_000_000n,
          maxRefundGasOverhead: 500_000n,
          maxRefundAmount: 1_000_000n,
        },
      },
    },
  }
  const approval = {
    to: usdc,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: ['0x1d7df6ddc7328ac827eb4d7f171c60afb7f9a599', 1_000_000n],
    }),
  }
  const route = makeRoute({
    element: { idsAndAmounts: [['1', '100']], spendTokens: [['1', '100']] },
    mandate: {
      preClaimOps: { vt: `0x0201${'00'.repeat(30)}`, ops: [approval] },
      destinationOps: {
        vt: `0x0201${'00'.repeat(30)}`,
        ops: [approval, ...request.rhinestoneParams.calls],
      },
    },
    refund: { token: usdc },
  })
  const intentRoute = { ...route, intentOp: { ...route.intentOp, nonce: '1' } }
  const owner = toAccount({
    address: REGISTRAR,
    signMessage: async () => {
      throw new Error('Signing disabled')
    },
    signTransaction: async () => {
      throw new Error('Signing disabled')
    },
    signTypedData: async () => {
      throw new Error('Signing disabled')
    },
  })
  const account = await new RhinestoneSDK({
    auth: { mode: 'apiKey', apiKey: 'test' },
  }).createAccount({
    account: buildStandaloneAccountConfig(1),
    owners: {
      type: 'ecdsa',
      accounts: [owner],
      module: getDestinationContracts(1).hcaOwnerAndSessionValidator,
    },
  })
  const hca = account.getAddress()
  const verifiedRoute = {
    ...intentRoute,
    intentOp: {
      ...intentRoute.intentOp,
      sponsor: hca,
      elements: intentRoute.intentOp.elements.map((element) => ({
        ...element,
        mandate: { ...element.mandate, recipient: hca },
      })),
    },
  }
  const getSigningMessages = (intentRoute: typeof verifiedRoute) =>
    account.getTransactionMessages({
      // The SDK types require tokenOut even when the no-funding route has none.
      intentRoute: intentRoute as never,
      intentInput: {},
      transaction: {
        sourceChains: [mainnet],
        targetChain: mainnet,
        calls: [...request.rhinestoneParams.calls],
      },
    })
  const signingMessages = getSigningMessages(verifiedRoute)
  return {
    request: { ...request, from: hca },
    intentRoute: verifiedRoute,
    signingMessages,
    getSigningMessages,
  }
}

describe('checkOwnerIntentRoute', () => {
  it('accepts only the capped Paymaster approval and the verified SingleChainOps authorization', async () => {
    expect(checkOwnerIntentRoute(await makeLiveOwnerQuote())).toBeUndefined()
  })

  it('requires the SDK authorization before accepting routing metadata', async () => {
    const { request, intentRoute } = await makeLiveOwnerQuote()
    expect(checkOwnerIntentRoute({ request, intentRoute })).toBeInstanceOf(
      OwnerIntentValidationError,
    )
  })

  it.each([
    { label: 'another spender', spender: REGISTRAR, amount: 1_000_000n },
    {
      label: 'a larger approval',
      spender: '0x1d7df6ddc7328ac827eb4d7f171c60afb7f9a599',
      amount: 1_000_001n,
    },
    {
      label: 'a different approval cap',
      spender: '0x1d7df6ddc7328ac827eb4d7f171c60afb7f9a599',
      amount: 999_999n,
    },
  ] as const)(
    'refuses $label even when the SDK would sign it',
    async ({ spender, amount }) => {
      const input = await makeLiveOwnerQuote()
      const intentRoute = {
        ...input.intentRoute,
        intentOp: {
          ...input.intentRoute.intentOp,
          elements: input.intentRoute.intentOp.elements.map((element) => ({
            ...element,
            mandate: {
              ...element.mandate,
              destinationOps: {
                ...element.mandate.destinationOps,
                ops: element.mandate.destinationOps.ops.map((call, index) =>
                  index === 0
                    ? {
                        ...call,
                        data: encodeFunctionData({
                          abi: erc20Abi,
                          functionName: 'approve',
                          args: [spender, amount],
                        }),
                      }
                    : call,
                ),
              },
            },
          })),
        },
      }
      expect(
        checkOwnerIntentRoute({
          ...input,
          intentRoute,
          signingMessages: input.getSigningMessages(intentRoute),
        }),
      ).toBeInstanceOf(OwnerIntentValidationError)
    },
  )

  it.each([
    {
      label: 'origin domain',
      change: (
        messages: ReturnType<RhinestoneAccount['getTransactionMessages']>,
      ) => ({
        ...messages,
        origin: messages.origin.map((message) => ({
          ...message,
          domain: { ...message.domain, verifyingContract: REGISTRAR },
        })),
      }),
    },
    {
      label: 'destination domain',
      change: (
        messages: ReturnType<RhinestoneAccount['getTransactionMessages']>,
      ) => ({
        ...messages,
        destination: {
          ...messages.destination,
          domain: { ...messages.destination.domain, chainId: 8453 },
        },
      }),
    },
    {
      label: 'additional authorization',
      change: (
        messages: ReturnType<RhinestoneAccount['getTransactionMessages']>,
      ) => ({
        ...messages,
        origin: [...messages.origin, ...messages.origin],
      }),
    },
    {
      label: 'typed data structure',
      change: (
        messages: ReturnType<RhinestoneAccount['getTransactionMessages']>,
      ) => ({
        ...messages,
        origin: messages.origin.map((message) => ({
          ...message,
          primaryType: 'Op',
        })),
      }),
    },
  ])('refuses a changed $label', async ({ change }) => {
    const input = await makeLiveOwnerQuote()
    expect(
      checkOwnerIntentRoute({
        ...input,
        signingMessages: change(input.signingMessages),
      }),
    ).toBeInstanceOf(OwnerIntentValidationError)
  })
  it('accepts the exact same-chain calls at all retained fee ceilings', () => {
    expect(
      checkOwnerIntentRoute({ request: REQUEST, intentRoute: makeRoute() }),
    ).toBeUndefined()
  })

  it.each([
    ['changed target', withCalls([{ ...CALLS[0], to: REGISTRAR }, CALLS[1]])],
    [
      'changed calldata',
      withCalls([{ ...CALLS[0], data: '0xfeed' }, CALLS[1]]),
    ],
    ['changed value', withCalls([{ ...CALLS[0], value: 1n }, CALLS[1]])],
    ['reordered calls', withCalls([CALLS[1], CALLS[0]])],
    ['additional call', withCalls([...CALLS, CALLS[0]])],
    ['missing call', withCalls([CALLS[0]])],
    [
      'unsupported execution type',
      makeRoute({
        mandate: {
          destinationOps: { vt: `0xff${'00'.repeat(31)}`, ops: [...CALLS] },
        },
      }),
    ],
    [
      'unexpected signature mode',
      makeRoute({
        mandate: {
          destinationOps: { vt: `0x0200${'00'.repeat(30)}`, ops: [...CALLS] },
        },
      }),
    ],
    [
      'source operations',
      makeRoute({
        mandate: { preClaimOps: { vt: zeroHash, ops: [CALLS[0]] } },
      }),
    ],
    ['wrong origin chain', makeRoute({ element: { chainId: '8453' } })],
    [
      'wrong target chain',
      makeRoute({ mandate: { destinationChainId: '8453' } }),
    ],
    ['wrong recipient', makeRoute({ mandate: { recipient: REGISTRAR } })],
    ['token claims', makeRoute({ element: { idsAndAmounts: [['1', '1']] } })],
    ['token spending', makeRoute({ element: { spendTokens: [['1', '1']] } })],
    ['token delivery', makeRoute({ mandate: { tokenOut: [['1', '1']] } })],
    [
      'another signing path',
      makeRoute({ context: { settlementLayer: 'SAME_CHAIN' } }),
    ],
    [
      'another funding path',
      makeRoute({ context: { fundingMethod: 'PERMIT2' } }),
    ],
    ['another fee token', makeRoute({ refund: { token: REGISTRAR } })],
    [
      'exchange rate above cap',
      makeRoute({ refund: { exchangeRate: 3_000_000_001n } }),
    ],
    [
      'gas overhead above cap',
      makeRoute({ refund: { overhead: (1_000_000n << 128n) | 500_001n } }),
    ],
    [
      'refund amount above cap',
      makeRoute({ refund: { overhead: (1_000_001n << 128n) | 500_000n } }),
    ],
    [
      'native fee with a nonzero amount',
      makeRoute({ refund: { token: zeroAddress } }),
    ],
    ['invalid packed refund', makeRoute({ refund: { overhead: -1n } })],
    ['missing route', undefined],
    [
      'extra element',
      {
        intentOp: {
          ...makeRoute().intentOp,
          elements: [
            ...makeRoute().intentOp.elements,
            ...makeRoute().intentOp.elements,
          ],
        },
      },
    ],
  ])('rejects %s', (_name, intentRoute) => {
    expect(
      checkOwnerIntentRoute({ request: REQUEST, intentRoute }),
    ).toBeInstanceOf(OwnerIntentValidationError)
  })
})
