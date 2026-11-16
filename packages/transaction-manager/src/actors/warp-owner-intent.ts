import { findGasRefundViolations } from '@ens-apps/smart-account'
import { fromSync, TaggedError } from '@ens-apps/utils/neverthrow'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import * as v from 'valibot'
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  hashTypedData,
  isAddress,
  isAddressEqual,
  zeroHash,
} from 'viem'
import type { RhinestoneTransactionRequest } from '../types/transaction.types'

const OWNER_ERC7579_MODE: Hex = `0x0201${'00'.repeat(30)}`
const MAINNET_USDC: Address = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const MAINNET_PAYMASTER: Address = '0x1d7df6ddc7328ac827eb4d7f171c60afb7f9a599'
const INTENT_EXECUTOR: Address = '0x00000000005ad9ce1f5035fd62ca96cef16adaaf'
const SINGLE_CHAIN_OPS_TYPES = {
  SingleChainOps: [
    { name: 'account', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'op', type: 'Op' },
    { name: 'gasRefund', type: 'GasRefund' },
  ],
  Op: [
    { name: 'vt', type: 'bytes32' },
    { name: 'ops', type: 'Ops[]' },
  ],
  Ops: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
  ],
  GasRefund: [
    { name: 'token', type: 'address' },
    { name: 'exchangeRate', type: 'uint256' },
    { name: 'overhead', type: 'uint256' },
  ],
} as const
const addressSchema = v.custom<Address>(
  (value) => typeof value === 'string' && isAddress(value, { strict: false }),
)
const uintSchema = v.pipe(
  v.union([v.bigint(), v.pipe(v.string(), v.regex(/^(?:\d+|0x[\da-f]+)$/i))]),
  v.transform((value) => BigInt(value)),
  v.minValue(0n),
  v.maxValue((1n << 256n) - 1n),
)
const emptyArraySchema = v.pipe(v.array(v.unknown()), v.length(0))
const routeSchema = v.object({
  tokenRequirements: v.optional(
    v.pipe(
      v.record(v.string(), v.unknown()),
      v.check((value) => Object.keys(value).length === 0),
    ),
  ),
  intentOp: v.object({
    sponsor: addressSchema,
    nonce: v.optional(uintSchema),
    elements: v.strictTuple([
      v.object({
        chainId: uintSchema,
        idsAndAmounts: emptyArraySchema,
        spendTokens: emptyArraySchema,
        swapOrigins: v.optional(
          v.pipe(
            v.record(v.string(), v.unknown()),
            v.check((value) => Object.keys(value).length === 0),
          ),
        ),
        mandate: v.object({
          recipient: addressSchema,
          destinationChainId: uintSchema,
          tokenOut: emptyArraySchema,
          swapDestinations: v.optional(emptyArraySchema),
          preClaimOps: v.object({
            vt: v.picklist([zeroHash, OWNER_ERC7579_MODE]),
            ops: emptyArraySchema,
          }),
          destinationOps: v.object({
            // IntentExecutor Type.ERC7579 (2) + SigMode.ERC1271 (1).
            // The executor runs this call array through the account's atomic batch mode.
            vt: v.literal(OWNER_ERC7579_MODE),
            ops: v.array(
              v.object({
                to: addressSchema,
                value: uintSchema,
                data: v.pipe(v.string(), v.regex(/^0x(?:[\da-f]{2})*$/i)),
              }),
            ),
          }),
          qualifier: v.object({
            settlementContext: v.object({
              // This is the SDK's SingleChainOps signing path, with no bridge,
              // Permit2/Compact claim or separate source-chain authorization.
              settlementLayer: v.literal('INTENT_EXECUTOR'),
              fundingMethod: v.literal('NO_FUNDING'),
              using7579: v.literal(true),
              gasRefund: v.object({
                token: addressSchema,
                exchangeRate: uintSchema,
                overhead: uintSchema,
              }),
            }),
          }),
        }),
      }),
    ]),
  }),
})

const elementSchema = routeSchema.entries.intentOp.entries.elements.items[0]
const signingRouteSchema = v.object({
  ...routeSchema.entries,
  tokenRequirements: v.optional(v.record(v.string(), v.unknown())),
  intentOp: v.object({
    ...routeSchema.entries.intentOp.entries,
    nonce: uintSchema,
    elements: v.strictTuple([
      v.object({
        ...elementSchema.entries,
        // SingleChainOps signs the destination operation and refund only. These
        // legacy routing fields cannot authorize a Permit2 or Compact claim.
        idsAndAmounts: v.array(v.unknown()),
        spendTokens: v.array(v.unknown()),
        mandate: v.object({
          ...elementSchema.entries.mandate.entries,
          preClaimOps: v.object({
            ...elementSchema.entries.mandate.entries.preClaimOps.entries,
            ops: v.array(v.unknown()),
          }),
        }),
      }),
    ]),
  }),
})

export class OwnerIntentValidationError extends TaggedError(
  'OwnerIntentValidationError',
)<{
  readonly cause: unknown
}> {}

/** Validate the untrusted route against local calls and independently retained fee limits. */
export const checkOwnerIntentRoute = (input: {
  readonly request: RhinestoneTransactionRequest
  readonly intentRoute: unknown
  readonly signingMessages?: ReturnType<
    RhinestoneAccount['getTransactionMessages']
  >
}): OwnerIntentValidationError | undefined => {
  const { request } = input
  const limits = request.rhinestoneParams.ownerIntentLimits
  if (!limits) return undefined
  const parsed = input.signingMessages
    ? v.safeParse(signingRouteSchema, input.intentRoute)
    : v.safeParse(routeSchema, input.intentRoute)
  if (!parsed.success)
    return new OwnerIntentValidationError({
      message:
        'The prepared owner calls or refund route is not a supported single-chain setup.',
      cause: parsed.issues,
    })
  const element = parsed.output.intentOp.elements[0]
  const { mandate } = element
  const { gasRefund } = mandate.qualifier.settlementContext
  const canVerifyOwnerAuthorization =
    input.signingMessages !== undefined &&
    request.chainId === 1 &&
    isAddressEqual(limits.refundToken, MAINNET_USDC)
  const feeApproval = {
    to: MAINNET_USDC,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [MAINNET_PAYMASTER, gasRefund.overhead >> 128n],
    }),
  }
  const expected =
    canVerifyOwnerAuthorization &&
    mandate.destinationOps.ops.length ===
      request.rhinestoneParams.calls.length + 1
      ? [feeApproval, ...request.rhinestoneParams.calls]
      : request.rhinestoneParams.calls
  if (
    !isAddressEqual(parsed.output.intentOp.sponsor, request.from) ||
    element.chainId !== BigInt(request.chainId) ||
    mandate.destinationChainId !== BigInt(request.chainId) ||
    !isAddressEqual(mandate.recipient, request.from) ||
    mandate.destinationOps.ops.length !== expected.length ||
    !mandate.destinationOps.ops.every((call, index) => {
      const original = expected[index]
      return (
        original &&
        isAddressEqual(call.to, original.to) &&
        call.value === original.value &&
        call.data.toLowerCase() === original.data.toLowerCase()
      )
    })
  )
    return new OwnerIntentValidationError({
      message: 'The prepared owner calls differ from the requested setup.',
      cause: undefined,
    })

  const violations = findGasRefundViolations(
    {
      token: gasRefund.token,
      exchangeRate: gasRefund.exchangeRate,
      refundAmount: gasRefund.overhead >> 128n,
      gasOverhead: gasRefund.overhead & ((1n << 128n) - 1n),
    },
    limits.refundCaps,
    limits.refundToken,
  )
  if (violations.length > 0)
    return new OwnerIntentValidationError({
      message: 'The prepared owner gas refund exceeds the retained fee limits.',
      cause: violations,
    })
  if (!input.signingMessages) return undefined
  const nonce = parsed.output.intentOp.nonce
  if (!canVerifyOwnerAuthorization || nonce === undefined)
    return new OwnerIntentValidationError({
      message: 'The owner signing authorization is unsupported.',
      cause: undefined,
    })
  const messages = input.signingMessages
  return fromSync(
    () => {
      const expectedHash = hashTypedData({
        domain: {
          name: 'IntentExecutor',
          version: 'v0.0.1',
          chainId: request.chainId,
          verifyingContract: INTENT_EXECUTOR,
        },
        types: SINGLE_CHAIN_OPS_TYPES,
        primaryType: 'SingleChainOps',
        message: {
          account: request.from,
          nonce,
          op: { vt: OWNER_ERC7579_MODE, ops: [...expected] },
          gasRefund,
        },
      })
      return (
        messages.origin.length === 1 &&
        messages.origin.every(
          (message) => hashTypedData(message) === expectedHash,
        ) &&
        hashTypedData(messages.destination) === expectedHash
      )
    },
    (cause) => new OwnerIntentValidationError({ cause }),
  ).match(
    (isExpected) =>
      isExpected
        ? undefined
        : new OwnerIntentValidationError({
            message:
              'The SDK owner signing payload differs from the authorized setup.',
            cause: undefined,
          }),
    (error) => error,
  )
}
