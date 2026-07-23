import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import {
  type Address,
  createPublicClient,
  type Hex,
  http,
  isAddressEqual,
  parseEventLogs,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { requireAuth } from '#app/middleware/auth.js'
import { createApp } from '#app/middleware/hono.js'
import { getCrossmintDb } from '#core/database/crossmint.js'
import { crossmintOrders } from '#core/database/schema/crossmint.js'
import { SEPOLIA_RPC_URL, sepoliaWithEns } from '#core/eth/client.js'
import { VOUCHER_ABI } from '#services/crossmint/abis.js'
import {
  generateSecret,
  getRegisterPriceTotal,
  PAYMENT_TOKENS,
  precomputeOrderCommitment,
  VOUCHER_ADDRESS,
  VOUCHER_PAYMENT_TOKENS,
} from '#services/crossmint/fulfilment.js'
import { quoteFulfilmentFee } from '#services/crossmint/intent-quote.js'
import {
  type CreateOrderBody,
  CreateOrderBodySchema,
  type PaymentToken,
  type RegistrationJob,
  SettleOrderBodySchema,
} from '#services/crossmint/types.js'
import { logger } from '#utils/logger.js'

/** Read-only client for precompute + receipt/price reads (no wallet). */
function createReadClient() {
  return createPublicClient({
    chain: sepoliaWithEns,
    transport: http(SEPOLIA_RPC_URL),
  })
}

/**
 * Shared order-intent creation: fixes the buyer-bound commitment + the
 * counterfactual resolver BEFORE payment, so the voucher can be minted
 * carrying this commitment and fulfilment can verify the paid-for artifact
 * authorizes exactly this registration. Used by both the authed (card) and
 * public (self-pay) create routes. The plaintext label is stored server-side
 * only, never on-chain.
 */
async function createOrderIntent(
  env: CloudflareBindings,
  body: CreateOrderBody,
  userId: string | null,
): Promise<{
  orderId: string
  commitment: Hex
  totalDue: string
  gasFee: string
  /** The token the buyer must mint the voucher in (rail settlement asset). */
  paymentToken: Address
}> {
  const id = crypto.randomUUID()
  const label = body.name.replace(/\.eth$/, '')
  const secret = generateSecret()

  const publicClient = createReadClient()

  // Resolve the payer/deployer address for CREATE2 resolver precomputation.
  // The deployer is the Safe in Roles mode, the EOA in direct mode. The
  // direct-mode key preference MUST mirror `createServerWalletClient`
  // (dedicated member key first) or the precomputed resolver/commitment
  // won't match the address fulfilment actually deploys from.
  // Falls back to zeroAddress for dev/preview workers without a configured
  // payer (the commitment won't be fulfillable, but the route won't 500).
  const directKey = env.REGISTRAR_MEMBER_PRIVATE_KEY ?? env.ETH_PRIVATE_KEY
  const deployer: Address =
    (env.REGISTRAR_SAFE_ADDRESS as Address | undefined) ??
    (env.ALLOW_DIRECT_EOA_SIGNER && directKey
      ? privateKeyToAccount(directKey as Hex).address
      : zeroAddress)

  // The commitment precompute and the fee quote are independent — run them
  // concurrently; register-price read joins them for the order total.
  const [{ resolver, commitment }, price, gasFee] = await Promise.all([
    precomputeOrderCommitment(publicClient, deployer, {
      label,
      buyer: body.ownerAddress as Address,
      secret,
      duration: BigInt(body.durationSeconds),
    }),
    getRegisterPriceTotal(publicClient, {
      label,
      duration: BigInt(body.durationSeconds),
      paymentToken: PAYMENT_TOKENS[body.paymentToken],
    }),
    quoteFulfilmentFee(env),
  ])

  // Server-authoritative total the voucher must carry: live register price
  // + the gas-economics fulfilment fee (the gasFee component, forwarded
  // on-chain to the executor at mint) — EXACTLY, no price headroom. The
  // register-time pull can never exceed the quote: base price is constant
  // for a (label, duration) and the premium component only DECAYS between
  // quote and register (dutch auction). Drift buffers belong on GAS only —
  // a price headroom here is a real USDC over-deposit that accretes in the
  // Safe (it did: 2% × price per order). The one residual up-risk is an
  // admin base-rate change landing mid-order — a governance-scale event
  // handled as fail-and-recover (register reverts, order retries/tops up),
  // not priced into every order. The settle route enforces
  // `amountPaid >= amount_due`.
  const amountDue = price + gasFee

  await getCrossmintDb(env).insert(crossmintOrders).values({
    id,
    user_id: userId,
    owner_address: body.ownerAddress.toLowerCase(),
    name: label,
    duration: body.durationSeconds,
    secret,
    commitment,
    resolver_address: resolver,
    payment_token: body.paymentToken,
    amount_due: amountDue.toString(),
    status: 'pending',
  })

  return {
    orderId: id,
    commitment,
    totalDue: amountDue.toString(),
    gasFee: gasFee.toString(),
    // The token the buyer must mint the voucher in — the RAIL's settlement
    // asset (Circle USDC on Sepolia), NOT the registrar's pricing token.
    // Server-declared so the frontend never carries its own token constant.
    paymentToken: VOUCHER_PAYMENT_TOKENS[body.paymentToken],
  }
}

/** Publicly readable order-status projection (no secret, no user_id). */
const ORDER_STATUS_COLUMNS = {
  status: true,
  name: true,
  commit_tx_hash: true,
  register_tx_hash: true,
  error: true,
} as const

export default createApp()
  .basePath('/crossmint')
  /**
   * Create a pending registration intent before opening the Crossmint checkout.
   * Returns the order id, which the frontend passes to the embedded checkout as
   * `clientReference` so the payment webhook can join back to this row.
   *
   * SIWE-authed on purpose: no wallet ever signs anything in the card flow, so
   * this is the only proof the buyer controls the delivery address before
   * spending irreversible fiat.
   */
  .post(
    '/orders',
    ...requireAuth,
    vValidator('json', CreateOrderBodySchema),
    async (c) => {
      const body = c.req.valid('json')

      // The name is delivered to the authenticated wallet only.
      if (!isAddressEqual(body.ownerAddress, c.var.address as `0x${string}`)) {
        return c.json(
          { error: 'ownerAddress must match the authenticated wallet' },
          400,
        )
      }

      const { orderId, commitment, totalDue, gasFee, paymentToken } =
        await createOrderIntent(c.env, body, c.var.user_id)

      logger.info('Crossmint order intent created', {
        orderId,
        user_id: c.var.user_id,
      })
      return c.json({ orderId, commitment, totalDue, gasFee, paymentToken })
    },
  )
  /** Poll the fulfilment status of an order (scoped to the buyer's wallet). */
  .get('/orders/:id', ...requireAuth, async (c) => {
    const id = c.req.param('id')
    const order = await getCrossmintDb(c.env).query.crossmintOrders.findFirst({
      where: and(
        eq(crossmintOrders.id, id),
        eq(crossmintOrders.owner_address, c.var.address.toLowerCase()),
      ),
      columns: ORDER_STATUS_COLUMNS,
    })

    if (!order) {
      return c.json({ error: 'Order not found' }, 404)
    }

    return c.json({
      status: order.status,
      name: order.name,
      commitTxHash: order.commit_tx_hash,
      registerTxHash: order.register_tx_hash,
      error: order.error,
    })
  })
  /**
   * Self-pay (connected wallet) order creation — deliberately UNAUTHENTICATED.
   *
   * No SIWE: the buyer proves control of `ownerAddress` on-chain by signing the
   * voucher mint from that wallet (`mintSelf*` binds buyer == msg.sender into
   * the commitment), which is strictly stronger evidence than a session token.
   * Creating an order is free and grants nothing: fulfilment only ever spends
   * against a settled on-chain voucher carrying this order's exact commitment
   * (see the settle route). Worst case an attacker creates junk DB rows —
   * rate-limiting territory, not auth territory.
   */
  .post(
    '/voucher/orders',
    vValidator('json', CreateOrderBodySchema),
    async (c) => {
      const body = c.req.valid('json')
      const { orderId, commitment, totalDue, gasFee, paymentToken } =
        await createOrderIntent(c.env, body, null)

      logger.info('Self-pay voucher order intent created', {
        orderId,
        totalDue,
        gasFee,
      })
      return c.json({ orderId, commitment, totalDue, gasFee, paymentToken })
    },
  )
  /**
   * Settle a self-pay order with the buyer's mint transaction — the on-chain
   * payment proof. Verifies the receipt emitted `VoucherMinted` FROM the
   * voucher contract with this order's exact commitment (which binds label,
   * buyer, secret, resolver and duration), delivered to the order's owner, in
   * the order's payment token, for at least the current register price. Only
   * then does the order flip to `paid` and enter the fulfilment queue.
   *
   * Unauthenticated by design: everything asserted here comes from the chain,
   * and the commitment can't be forged (the secret never leaves the server).
   * Idempotent: re-settling a non-pending order reports its current status.
   */
  .post(
    '/voucher/orders/:id/settle',
    vValidator('json', SettleOrderBodySchema),
    async (c) => {
      const id = c.req.param('id')
      const { txHash } = c.req.valid('json')
      const db = getCrossmintDb(c.env)

      const order = await db.query.crossmintOrders.findFirst({
        where: eq(crossmintOrders.id, id),
      })
      if (!order) {
        return c.json({ error: 'Order not found' }, 404)
      }
      if (order.status !== 'pending') {
        // Already settled (or beyond) — idempotent OK.
        return c.json({ ok: true, status: order.status })
      }
      if (!order.commitment) {
        return c.json({ error: 'Order has no commitment' }, 409)
      }

      const publicClient = createReadClient()

      let receipt: Awaited<
        ReturnType<typeof publicClient.getTransactionReceipt>
      >
      try {
        receipt = await publicClient.getTransactionReceipt({
          hash: txHash as Hex,
        })
      } catch {
        return c.json(
          { error: 'Mint transaction not found (not mined yet?)' },
          400,
        )
      }
      if (receipt.status !== 'success') {
        return c.json({ error: 'Mint transaction reverted' }, 400)
      }

      // Only accept VoucherMinted emitted BY the voucher contract — a
      // malicious contract in the same tx could emit a matching-topic event.
      const mint = parseEventLogs({
        abi: VOUCHER_ABI,
        eventName: 'VoucherMinted',
        logs: receipt.logs,
      }).find(
        (log) =>
          isAddressEqual(log.address, VOUCHER_ADDRESS) &&
          log.args.commitment.toLowerCase() === order.commitment?.toLowerCase(),
      )
      if (!mint) {
        return c.json(
          {
            error:
              "Transaction contains no voucher mint carrying this order's commitment",
          },
          400,
        )
      }

      const { tokenId, to, paymentToken, amountPaid } = mint.args
      if (!isAddressEqual(to, order.owner_address as Address)) {
        return c.json(
          { error: 'Voucher recipient does not match the order owner' },
          400,
        )
      }
      const expectedToken =
        VOUCHER_PAYMENT_TOKENS[(order.payment_token ?? 'USDC') as PaymentToken]
      if (!isAddressEqual(paymentToken, expectedToken)) {
        return c.json({ error: 'Voucher paid in an unexpected token' }, 400)
      }

      // The order IS a quote: enforce the server-authoritative amount_due
      // (price + headroom + fulfilment gasFee, fixed at order time) when
      // present. Legacy rows without one fall back to the live register
      // price as the floor.
      const minDue = order.amount_due
        ? BigInt(order.amount_due)
        : await getRegisterPriceTotal(publicClient, {
            label: order.name,
            duration: BigInt(order.duration),
            paymentToken: expectedToken,
          })
      if (amountPaid < minDue) {
        return c.json(
          {
            error: `Voucher underpaid: carries ${amountPaid}, order total due is ${minDue}`,
          },
          400,
        )
      }

      // pending → paid, race-safe against concurrent settles of the same order.
      const updated = await db
        .update(crossmintOrders)
        .set({
          status: 'paid',
          voucher_token_id: tokenId.toString(),
          amount_paid: amountPaid.toString(),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(crossmintOrders.id, id),
            eq(crossmintOrders.status, 'pending'),
          ),
        )
        .returning({ id: crossmintOrders.id })
      if (updated.length === 0) {
        return c.json({ ok: true, duplicate: true })
      }

      await c.env.REGISTRATION_QUEUE.send({
        orderId: id,
        phase: 'commit',
      } satisfies RegistrationJob)

      logger.info('Self-pay voucher settled, registration enqueued', {
        orderId: id,
        voucherTokenId: tokenId.toString(),
      })
      return c.json({ ok: true, status: 'paid' })
    },
  )
  /**
   * Public status poll for self-pay orders. The UUIDv4 order id is the
   * capability: unguessable, known only to the creator. Deliberately
   * unauthenticated so fulfilment progress never depends on a live SIWE
   * session (an expired JWT mid-flow must not blind the buyer after payment).
   */
  .get('/voucher/orders/:id', async (c) => {
    const id = c.req.param('id')
    const order = await getCrossmintDb(c.env).query.crossmintOrders.findFirst({
      where: eq(crossmintOrders.id, id),
      columns: ORDER_STATUS_COLUMNS,
    })

    if (!order) {
      return c.json({ error: 'Order not found' }, 404)
    }

    return c.json({
      status: order.status,
      name: order.name,
      commitTxHash: order.commit_tx_hash,
      registerTxHash: order.register_tx_hash,
      error: order.error,
    })
  })
