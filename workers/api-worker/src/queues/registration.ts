import { eq } from 'drizzle-orm'
import type { Address } from 'viem'
import { type CrossmintDb, getCrossmintDb } from '#core/database/crossmint.js'
import {
  type CrossmintOrderStatus,
  crossmintOrders,
} from '#core/database/schema/crossmint.js'
import { KV_KEY } from '#core/kv/index.js'
import {
  assertCommitmentMatchesChain,
  assertVoucherCommitment,
  authorizedPaymentAmount,
  burnVoucher,
  createServerWalletClient,
  deployDedicatedResolver,
  ensureTokenAllowance,
  getRegisterPriceTotal,
  PAYMENT_TOKENS,
  precomputeOrderCommitment,
  readMinCommitmentAge,
  submitCommit,
  submitRegister,
  verifyRegistration,
} from '#services/crossmint/fulfilment.js'
import type {
  PaymentToken,
  RegistrationJob,
} from '#services/crossmint/types.js'
import { logger } from '#utils/logger.js'

// Give up (mark failed) after this many delivery attempts; below it we retry
// so the queue's backoff + DLQ can absorb transient RPC / nonce hiccups.
const MAX_ATTEMPTS = 3
// Buffer added on top of MIN_COMMITMENT_AGE before the register phase fires.
const COMMITMENT_AGE_BUFFER_SECONDS = 15

type OrderRow = typeof crossmintOrders.$inferSelect

async function loadOrder(
  db: CrossmintDb,
  orderId: string,
): Promise<OrderRow | undefined> {
  return db.query.crossmintOrders.findFirst({
    where: eq(crossmintOrders.id, orderId),
  })
}

async function updateOrder(
  db: CrossmintDb,
  orderId: string,
  fields: Partial<OrderRow> & { status?: CrossmintOrderStatus },
): Promise<void> {
  await db
    .update(crossmintOrders)
    .set({ ...fields, updated_at: new Date() })
    .where(eq(crossmintOrders.id, orderId))
}

/**
 * Phase 1: deploy the buyer's dedicated resolver, build + submit the commitment,
 * then re-enqueue a `register` job delayed past MIN_COMMITMENT_AGE.
 */
async function runCommitPhase(
  db: CrossmintDb,
  env: CloudflareBindings,
  orderId: string,
): Promise<void> {
  const order = await loadOrder(db, orderId)
  if (!order) {
    logger.warn('Registration commit: order not found', { orderId })
    return
  }
  // Idempotent: only a freshly-paid order commits. Anything else is a
  // redelivery of an order already in-flight or done.
  if (order.status !== 'paid') {
    logger.debug('Registration commit: order not in paid state, skipping', {
      orderId,
      status: order.status,
    })
    return
  }

  await updateOrder(db, orderId, { status: 'committing' })

  const client = createServerWalletClient(env)
  // The registrar charges msg.sender (the PAYER — the Safe in Roles mode), so
  // the name is registered with owner = BUYER directly: the payer funds it, the
  // buyer receives it, no transfer step. The resolver is deployed buyer-owned at
  // its precomputed CREATE2 address, and the commitment — bound to the buyer —
  // was fixed and stored at order time so the voucher carries it. We re-derive
  // both here defensively (pre-forward-at-mint orders may lack them).
  const buyer = order.owner_address as Address
  const secret = order.secret as `0x${string}`
  const { resolver, commitment } =
    order.commitment && order.resolver_address
      ? {
          resolver: order.resolver_address as Address,
          commitment: order.commitment as `0x${string}`,
        }
      : await precomputeOrderCommitment(client, {
          label: order.name,
          buyer,
          secret,
          duration: BigInt(order.duration),
        })

  const deployedResolver = await deployDedicatedResolver(client, {
    owner: buyer,
    secret,
    expectedResolver: resolver,
  })
  // Belt-and-braces: the local commitment must equal the registrar's own
  // makeCommitment for the exact tuple we're about to commit.
  await assertCommitmentMatchesChain(client, {
    label: order.name,
    owner: buyer,
    secret,
    resolver: deployedResolver,
    duration: BigInt(order.duration),
    expected: commitment,
  })
  const commitTxHash = await submitCommit(client, commitment)
  const minAge = await readMinCommitmentAge(client)

  await updateOrder(db, orderId, {
    status: 'committed',
    commitment,
    resolver_address: deployedResolver,
    commit_tx_hash: commitTxHash,
    committed_at: new Date(),
  })

  const delaySeconds = Number(minAge) + COMMITMENT_AGE_BUFFER_SECONDS
  await env.REGISTRATION_QUEUE.send(
    { orderId, phase: 'register' } satisfies RegistrationJob,
    { delaySeconds },
  )
  logger.info('Registration committed, register phase scheduled', {
    orderId,
    commitTxHash,
    delaySeconds,
  })
}

/**
 * Phase 2 (delayed): approve the payment token from the payer (Safe or EOA) and
 * submit `register`, delivering the name to the buyer, then burn the voucher.
 */
async function runRegisterPhase(
  db: CrossmintDb,
  env: CloudflareBindings,
  orderId: string,
): Promise<void> {
  const order = await loadOrder(db, orderId)
  if (!order) {
    logger.warn('Registration register: order not found', { orderId })
    return
  }
  if (order.status !== 'committed') {
    logger.debug('Registration register: order not committed, skipping', {
      orderId,
      status: order.status,
    })
    return
  }
  if (!order.resolver_address) {
    throw new Error(`Order ${orderId} has no resolver_address`)
  }

  await updateOrder(db, orderId, { status: 'registering' })

  const client = createServerWalletClient(env)
  const buyer = order.owner_address as Address
  const resolver = order.resolver_address as Address
  const paymentToken = (order.payment_token ?? 'USDC') as PaymentToken
  const tokenAddress = PAYMENT_TOKENS[paymentToken]

  // Gate spending on the voucher: its stored commitment must equal the exact
  // (label, buyer, secret, resolver, duration) tuple we're about to register.
  // A mismatch (or a missing/burned voucher) means this order isn't authorized
  // to spend — fail before any approve/register. Skipped only when the webhook
  // never captured a voucher tokenId (older/partial orders).
  if (order.commitment && order.voucher_token_id) {
    await assertVoucherCommitment(client, {
      voucherTokenId: BigInt(order.voucher_token_id),
      expected: order.commitment as `0x${string}`,
    })
  }

  const price = await getRegisterPriceTotal(client, {
    label: order.name,
    duration: BigInt(order.duration),
    paymentToken: tokenAddress,
  })
  await ensureTokenAllowance(client, {
    token: tokenAddress,
    amount: authorizedPaymentAmount(price),
  })

  // Register straight to the buyer — the payer (msg.sender) funds it.
  const { hash: registerTxHash, tokenId } = await submitRegister(client, {
    label: order.name,
    owner: buyer,
    secret: order.secret as `0x${string}`,
    resolver,
    duration: BigInt(order.duration),
    paymentToken: tokenAddress,
  })

  const verified = await verifyRegistration(client, {
    tokenId,
    owner: buyer,
  })
  if (!verified) {
    logger.warn('Registration on-chain verification mismatch', {
      orderId,
      registerTxHash,
    })
  }

  await burnVoucher(client, env, order.voucher_token_id ?? undefined)

  await updateOrder(db, orderId, {
    status: 'registered',
    register_tx_hash: registerTxHash,
    payment_token: paymentToken,
  })
  logger.info('Registration completed', { orderId, registerTxHash })
}

export const handleRegistrationQueue = async (
  batch: MessageBatch<RegistrationJob>,
  env: CloudflareBindings,
): Promise<void> => {
  const db = getCrossmintDb(env)

  for (const message of batch.messages) {
    const job = message.body
    const lockKey = KV_KEY.CROSSMINT.ORDER_LOCK(job.orderId)

    // Serialize per order: a concurrent delivery (or the delayed register
    // racing a commit retry) must not double-process. If locked, back off.
    if (await env.KV.get(lockKey)) {
      message.retry({ delaySeconds: 30 })
      continue
    }
    await env.KV.put(lockKey, job.phase, { expirationTtl: 300 })

    try {
      if (job.phase === 'commit') {
        await runCommitPhase(db, env, job.orderId)
      } else {
        await runRegisterPhase(db, env, job.orderId)
      }
      message.ack()
    } catch (error) {
      logger.error('Registration job failed', {
        orderId: job.orderId,
        phase: job.phase,
        attempts: message.attempts,
        error,
      })
      if (message.attempts >= MAX_ATTEMPTS) {
        await updateOrder(db, job.orderId, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }).catch(() => {})
        message.ack()
      } else {
        message.retry({ delaySeconds: 30 })
      }
    } finally {
      await env.KV.delete(lockKey)
    }
  }
}
