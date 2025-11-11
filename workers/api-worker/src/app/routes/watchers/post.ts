import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import { getExpiry } from '#services/expiry/index.js'

export default createApp().post(
  '/',
  injectDb,
  ...requireAuth,
  vValidator(
    'json',
    v.object({
      name: v.string(),
    }),
  ),
  async (c) => {
    const { name } = c.req.valid('json')

    // Check if already watching
    const existing = await c.var.db
      .select()
      .from(TABLE.ensWatchers)
      .where(
        and(
          eq(TABLE.ensWatchers.user_id, c.var.user_id),
          eq(TABLE.ensWatchers.name, name),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      return c.json({ error: 'Already watching this name' }, 400)
    }

    // Fetch initial expiry data from subgraph
    const expiryResult = await getExpiry([name])

    if (expiryResult.isErr()) {
      console.error('Failed to fetch expiry data:', expiryResult.error)
      return c.json({ error: 'Failed to fetch expiry data' }, 500)
    }

    const expiryData = expiryResult.value
    const nameData = expiryData.find((d) => d.name === name)

    if (!nameData) {
      return c.json({ error: 'Name not found' }, 404)
    }

    // Insert watcher
    await c.var.db.insert(TABLE.ensWatchers).values({
      user_id: c.var.user_id,
      name,
    })

    // Upsert ens_names with fresh data
    if (nameData.expiryDate) {
      await c.var.db
        .insert(TABLE.ensNames)
        .values({
          name,
          expiry_at: nameData.expiryDate,
          last_checked_at: new Date(),
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: TABLE.ensNames.name,
          set: {
            expiry_at: nameData.expiryDate,
            last_checked_at: new Date(),
            updated_at: new Date(),
          },
        })

      // Create or update eval pointer
      const now = Date.now()
      const expiryTime = nameData.expiryDate.getTime()

      // Calculate next evaluation time (30 days before expiry, or 1 hour from now if closer)
      const nextEvalTime = Math.max(
        expiryTime - 30 * 24 * 60 * 60 * 1000,
        now + 60 * 60 * 1000,
      )

      await c.var.db
        .insert(TABLE.ensEvalPointers)
        .values({
          name,
          next_eval_at: new Date(nextEvalTime),
          lease_until: new Date(0),
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: TABLE.ensEvalPointers.name,
          set: {
            next_eval_at: new Date(nextEvalTime),
            updated_at: new Date(),
          },
        })
    }

    return c.json({
      message: 'Successfully added to watchlist',
      name,
      expiryDate: nameData.expiryDate?.toISOString(),
    })
  },
)
