import * as v from 'valibot'
import { ethAddress } from '#utils/validation.js'

/** Stablecoin the registrar is paid in (server EOA fronts this on-chain). */
export const PaymentTokenSchema = v.union([v.literal('USDC'), v.literal('DAI')])
export type PaymentToken = v.InferOutput<typeof PaymentTokenSchema>

/**
 * Body for creating a Crossmint checkout intent (authed). The plaintext label
 * lives in our DB only — never on-chain — to preserve commit-reveal
 * front-running protection. We hand the buyer back the order id and use it as
 * the Crossmint `clientReference` so the webhook can join back to this row.
 */
export const CreateOrderBodySchema = v.object({
  name: v.string(),
  durationSeconds: v.pipe(v.number(), v.integer(), v.minValue(1)),
  ownerAddress: ethAddress,
  paymentToken: v.optional(PaymentTokenSchema, 'USDC'),
})
export type CreateOrderBody = v.InferOutput<typeof CreateOrderBodySchema>

/**
 * The slice of the Crossmint webhook payload we rely on. Crossmint's full
 * payload is larger; we parse leniently and only require what we use.
 * `clientReference` is our order id (echoed back); it may arrive top-level or
 * under `metadata`. https://docs.crossmint.com/payments/advanced/webhooks
 */
export const CrossmintWebhookEventSchema = v.object({
  type: v.string(),
  data: v.object({
    /** Crossmint's order id (recorded for reference). */
    orderId: v.optional(v.string()),
    /** Our order id, echoed back so we can join to the pending row. */
    clientReference: v.optional(v.string()),
    metadata: v.optional(v.object({ clientReference: v.optional(v.string()) })),
    /** Voucher tokenId minted to the buyer (burned after delivery). */
    voucherTokenId: v.optional(v.string()),
    /** ETH (wei) the voucher contract received, for reconciliation. */
    amountPaid: v.optional(v.string()),
  }),
})
export type CrossmintWebhookEvent = v.InferOutput<
  typeof CrossmintWebhookEventSchema
>

/** Extract our order id (clientReference) from either location. */
export function getClientReference(
  event: CrossmintWebhookEvent,
): string | undefined {
  return event.data.clientReference ?? event.data.metadata?.clientReference
}

/** The event type that signals a settled payment ready for fulfilment. */
export const PAYMENT_SUCCEEDED_EVENT = 'orders.payment.succeeded'

/**
 * Work item on the registration queue. The two phases bracket the
 * MIN_COMMITMENT_AGE wait: `commit` deploys the resolver + commits, then
 * re-enqueues a `register` job with `delaySeconds`.
 */
export const RegistrationJobSchema = v.object({
  orderId: v.string(),
  phase: v.union([v.literal('commit'), v.literal('register')]),
})
export type RegistrationJob = v.InferOutput<typeof RegistrationJobSchema>
