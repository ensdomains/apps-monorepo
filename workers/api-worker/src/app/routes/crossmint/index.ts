import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import {
  type Address,
  createPublicClient,
  type Hex,
  http,
  isAddressEqual,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { requireAuth } from '#app/middleware/auth.js'
import { createApp } from '#app/middleware/hono.js'
import { getCrossmintDb } from '#core/database/crossmint.js'
import { crossmintOrders } from '#core/database/schema/crossmint.js'
import { SEPOLIA_RPC_URL, sepoliaWithEns } from '#core/eth/client.js'
import {
  generateSecret,
  precomputeOrderCommitment,
} from '#services/crossmint/fulfilment.js'
import { CreateOrderBodySchema } from '#services/crossmint/types.js'
import { logger } from '#utils/logger.js'

export default createApp()
  .basePath('/crossmint')
  /**
   * Create a pending registration intent before opening the Crossmint checkout.
   * Returns the order id, which the frontend passes to the embedded checkout as
   * `clientReference` so the payment webhook can join back to this row. The
   * plaintext label is stored here (server-side only), never on-chain.
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

      const id = crypto.randomUUID()
      const label = body.name.replace(/\.eth$/, '')
      const secret = generateSecret()

      // Read-only public client for the `proxyLogic` fetch — no wallet/roles
      // config needed for a read.
      const publicClient = createPublicClient({
        chain: sepoliaWithEns,
        transport: http(SEPOLIA_RPC_URL),
      })

      // Resolve the payer/deployer address for CREATE2 resolver precomputation.
      // The deployer is the Safe in Roles mode, the EOA in direct mode.
      // Falls back to zeroAddress for dev/preview workers without a configured
      // payer (the commitment won't be fulfillable, but the route won't 500).
      const deployer: Address =
        (c.env.REGISTRAR_SAFE_ADDRESS as Address | undefined) ??
        (c.env.ALLOW_DIRECT_EOA_SIGNER && c.env.ETH_PRIVATE_KEY
          ? privateKeyToAccount(c.env.ETH_PRIVATE_KEY as Hex).address
          : zeroAddress)

      // Fix the buyer-bound commitment + counterfactual resolver now, so the
      // voucher is minted carrying this commitment and fulfilment can verify the
      // paid-for artifact authorizes exactly this registration. The frontend
      // passes `commitment` into the voucher mint callData.
      const { resolver, commitment } = await precomputeOrderCommitment(
        publicClient,
        deployer,
        {
          label,
          buyer: body.ownerAddress as Address,
          secret,
          duration: BigInt(body.durationSeconds),
        },
      )

      await getCrossmintDb(c.env).insert(crossmintOrders).values({
        id,
        user_id: c.var.user_id,
        owner_address: body.ownerAddress.toLowerCase(),
        name: label,
        duration: body.durationSeconds,
        secret,
        commitment,
        resolver_address: resolver,
        payment_token: body.paymentToken,
        status: 'pending',
      })

      logger.info('Crossmint order intent created', {
        orderId: id,
        user_id: c.var.user_id,
      })
      return c.json({ orderId: id, commitment })
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
      columns: {
        status: true,
        name: true,
        commit_tx_hash: true,
        register_tx_hash: true,
        error: true,
      },
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
