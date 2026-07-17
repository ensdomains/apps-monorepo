import { eq } from 'drizzle-orm'
import type { Address } from 'viem'
import { type CrossmintDb, getCrossmintDb } from '#core/database/crossmint.js'
import {
  type CrossmintOrderStatus,
  crossmintOrders,
} from '#core/database/schema/crossmint.js'
import { KV_KEY } from '#core/kv/index.js'
import {
  authorizedPaymentAmount,
  burnVoucher,
  createServerWalletClient,
  deployDedicatedResolver,
  ensureTokenAllowance,
  getRegisterPriceTotal,
  makeCommitment,
  PAYMENT_TOKENS,
  readMinCommitmentAge,
  submitCommit,
  submitRegister,
  transferName,
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
  // The registration is charged to the PAYER (the treasury Safe in Roles mode,
  // the server EOA in direct mode — see createServerWalletClient), so we
  // register to the payer and transfer to the buyer in the register phase.
  // The commitment must bind the same owner used at register (the payer).
  // The resolver is deployed buyer-owned so the buyer controls records after
  // delivery (resolver ownership is independent of name ownership).
  const payer = client.payer
  const buyer = order.owner_address as Address

  const resolver = await deployDedicatedResolver(client, buyer)
  const commitment = await makeCommitment(client, {
    label: order.name,
    owner: payer,
    secret: order.secret as `0x${string}`,
    resolver,
    duration: BigInt(order.duration),
  })
  const commitTxHash = await submitCommit(client, commitment)
  const minAge = await readMinCommitmentAge(client)

  await updateOrder(db, orderId, {
    status: 'committed',
    commitment,
    resolver_address: resolver,
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
  const payer = client.payer
  const buyer = order.owner_address as Address
  const resolver = order.resolver_address as Address
  const paymentToken = (order.payment_token ?? 'USDC') as PaymentToken
  const tokenAddress = PAYMENT_TOKENS[paymentToken]

  const price = await getRegisterPriceTotal(client, {
    label: order.name,
    duration: BigInt(order.duration),
    paymentToken: tokenAddress,
  })
  await ensureTokenAllowance(client, {
    token: tokenAddress,
    amount: authorizedPaymentAmount(price),
  })

  // Register to the payer, then deliver the name to the buyer.
  const { hash: registerTxHash, tokenId } = await submitRegister(client, {
    label: order.name,
    owner: payer,
    secret: order.secret as `0x${string}`,
    resolver,
    duration: BigInt(order.duration),
    paymentToken: tokenAddress,
  })
  await transferName(client, { tokenId, to: buyer })

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
