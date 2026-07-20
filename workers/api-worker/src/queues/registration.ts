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
  // Idempotent: a freshly-paid order commits, and a `committing` order may
  // RE-ENTER — that's a queue retry after a mid-phase throw (the first
  // attempt flips paid→committing before doing on-chain work, so refusing
  // re-entry would wedge the order forever with the failure never recorded).
  // Concurrency is already serialized by the per-order KV lock; the on-chain
  // steps tolerate re-runs (resolver deploy is CREATE2-idempotent, re-commit
  // just refreshes the commitment timestamp).
  if (order.status !== 'paid' && order.status !== 'committing') {
    logger.debug('Registration commit: order not in commit state, skipping', {
      orderId,
      status: order.status,
    })
    return
  }

  await updateOrder(db, orderId, { status: 'committing' })

  // FAIL-CLOSED before ANY spend (the resolver deploy + commit below are
  // Roles-executed txs): a paid order must carry a verified voucher tokenId
  // (recorded by the Svix-verified webhook or the self-pay settle route).
  // Its absence means the paid flip came from an unverified source — refuse
  // before the first on-chain action, not just before register.
  if (!order.commitment || !order.voucher_token_id) {
    throw new Error(
      `Order ${orderId} has no verified voucher (commitment=${Boolean(
        order.commitment,
      )}, voucherTokenId=${Boolean(order.voucher_token_id)}); refusing to spend`,
    )
  }

  const client = createServerWalletClient(env)

  // The voucher must still exist and carry this order's exact commitment
  // (burned/missing vouchers read as bytes32(0) and never match).
  await assertVoucherCommitment(client, {
    voucherTokenId: BigInt(order.voucher_token_id),
    expected: order.commitment as `0x${string}`,
  })
  // The registrar charges msg.sender (the PAYER — the Safe in Roles mode), so
  // the name is registered with owner = BUYER directly: the payer funds it, the
  // buyer receives it, no transfer step.
  //
  // The commitment + resolver are the order's PAID-FOR identity: fixed and stored
  // at order time (owner = buyer), and the voucher was minted carrying that
  // commitment. We MUST use the stored values, never re-derive here — the
  // resolver precompute is payer-dependent (`deployer = client.payer`), so
  // re-deriving after a Roles-mode toggle would yield a different resolver and a
  // commitment that no longer matches the voucher, failing the order. An order
  // past `pending` without them is a data error, not something to paper over.
  const buyer = order.owner_address as Address
  const secret = order.secret as `0x${string}`
  if (!order.commitment || !order.resolver_address) {
    throw new Error(
      `Order ${orderId} reached commit phase without a stored commitment/resolver`,
    )
  }
  const resolver = order.resolver_address as Address
  const commitment = order.commitment as `0x${string}`

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
  // Same re-entry rule as the commit phase: `registering` means a retry of a
  // mid-phase throw, not a duplicate. The approve/register steps tolerate
  // re-runs (allowance check short-circuits; a second register of the same
  // commitment reverts on-chain rather than double-registering).
  if (order.status !== 'committed' && order.status !== 'registering') {
    logger.debug(
      'Registration register: order not in register state, skipping',
      {
        orderId,
        status: order.status,
      },
    )
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
  // to spend — fail before any approve/register. FAIL-CLOSED: an order with no
  // recorded voucher tokenId is not fulfillable, period. Every legitimate path
  // records one (Crossmint's signed webhook carries it; self-pay settle
  // extracts it from the mint receipt) — its absence means the paid flip came
  // from an unverified source.
  if (!order.commitment || !order.voucher_token_id) {
    throw new Error(
      `Order ${orderId} has no verified voucher (commitment=${Boolean(
        order.commitment,
      )}, voucherTokenId=${Boolean(order.voucher_token_id)}); refusing to spend`,
    )
  }
  await assertVoucherCommitment(client, {
    voucherTokenId: BigInt(order.voucher_token_id),
    expected: order.commitment as `0x${string}`,
  })

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
