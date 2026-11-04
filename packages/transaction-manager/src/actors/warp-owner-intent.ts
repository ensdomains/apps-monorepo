import { findGasRefundViolations } from '@ens-apps/smart-account'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import * as v from 'valibot'
import { type Address, isAddress, isAddressEqual, zeroHash } from 'viem'
import type { RhinestoneTransactionRequest } from '../types/transaction.types'

const OWNER_ERC7579_MODE = `0x0201${'00'.repeat(30)}`
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

export class OwnerIntentValidationError extends TaggedError(
  'OwnerIntentValidationError',
)<{
  readonly cause: unknown
}> {}

/** Validate the untrusted route against local calls and independently retained fee limits. */
export const checkOwnerIntentRoute = (input: {
  readonly request: RhinestoneTransactionRequest
  readonly intentRoute: unknown
}): OwnerIntentValidationError | undefined => {
  const { request } = input
  const limits = request.rhinestoneParams.ownerIntentLimits
  if (!limits) return undefined
  const parsed = v.safeParse(routeSchema, input.intentRoute)
  if (!parsed.success)
    return new OwnerIntentValidationError({
      message:
        'The prepared owner calls or refund route is not a supported single-chain setup.',
      cause: parsed.issues,
    })
  const element = parsed.output.intentOp.elements[0]
  const { mandate } = element
  const expected = request.rhinestoneParams.calls
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

  const { gasRefund } = mandate.qualifier.settlementContext
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
  return violations.length > 0
    ? new OwnerIntentValidationError({
        message:
          'The prepared owner gas refund exceeds the retained fee limits.',
        cause: violations,
      })
    : undefined
}
