import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import { isAddressEqual } from 'viem'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { schema } from '#core/database/index.js'
import { generateSecret } from '#services/crossmint/fulfilment.js'
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
    injectDb,
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

      const [row] = await c.var.db
        .insert(schema.crossmintOrders)
        .values({
          user_id: c.var.user_id,
          owner_address: body.ownerAddress.toLowerCase(),
          name: body.name.replace(/\.eth$/, ''),
          duration: BigInt(body.durationSeconds),
          secret: generateSecret(),
          payment_token: body.paymentToken,
          status: 'pending',
        })
        .returning({ id: schema.crossmintOrders.id })

      logger.info('Crossmint order intent created', {
        orderId: row.id,
        user_id: c.var.user_id,
      })
      return c.json({ orderId: row.id })
    },
  )
  /** Poll the fulfilment status of an order (scoped to the buyer's wallet). */
  .get('/orders/:id', ...requireAuth, injectDb, async (c) => {
    const id = c.req.param('id')
    const order = await c.var.db.query.crossmintOrders.findFirst({
      where: and(
        eq(schema.crossmintOrders.id, id),
        eq(schema.crossmintOrders.owner_address, c.var.address.toLowerCase()),
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
