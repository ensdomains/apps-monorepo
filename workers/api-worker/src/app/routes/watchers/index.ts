import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import { getExpiry } from '#services/expiry/index.js'

export default createApp()
  .basePath('/watchers')

  // List watched names for the authenticated user
  .get('/', injectDb, ...requireAuth, async (c) => {
    const watchers = await c.var.db
      .select({
        name: TABLE.ensWatchers.name,
        expiry_at: TABLE.ensNames.expiry_at,
        watch_reason: TABLE.ensWatchers.watch_reason,
        last_checked_at: TABLE.ensNames.last_checked_at,
      })
      .from(TABLE.ensWatchers)
      .leftJoin(TABLE.ensNames, eq(TABLE.ensWatchers.name, TABLE.ensNames.name))
      .where(eq(TABLE.ensWatchers.user_id, c.var.user_id))

    return c.json({ watchers })
  })

  // Add a name to watch
  .post(
    '/',
    injectDb,
    ...requireAuth,
    vValidator(
      'json',
      v.object({
        name: v.string(),
        watchReason: v.optional(v.picklist(['owned', 'favourited', 'manual'])),
      }),
    ),
    async (c) => {
      const { name, watchReason } = c.req.valid('json')
      const requestedReason = watchReason ?? 'manual'

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
        // If already watching, allow upgrading reason from manual -> owned/favourited.
        const currentReason = existing[0].watch_reason as
          | 'owned'
          | 'favourited'
          | 'manual'
          | undefined

        if (
          currentReason &&
          currentReason !== requestedReason &&
          currentReason === 'manual'
        ) {
          await c.var.db
            .update(TABLE.ensWatchers)
            .set({ watch_reason: requestedReason })
            .where(
              and(
                eq(TABLE.ensWatchers.user_id, c.var.user_id),
                eq(TABLE.ensWatchers.name, name),
              ),
            )
          return c.json({
            message: 'Updated watch reason',
            name,
            watchReason: requestedReason,
          })
        }

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
        watch_reason: requestedReason,
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
          expiryTime - 30 * 24 * 60 * 60 * 1000, // 30 days before
          now + 60 * 60 * 1000, // 1 hour from now
        )

        await c.var.db
          .insert(TABLE.ensEvalPointers)
          .values({
            name,
            next_eval_at: new Date(nextEvalTime),
            lease_until: new Date(0), // No lease initially
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

  // Remove a name from watchlist
  .delete('/:name', injectDb, ...requireAuth, async (c) => {
    const name = c.req.param('name')

    try {
      // Remove watcher
      const result = await c.var.db
        .delete(TABLE.ensWatchers)
        .where(
          and(
            eq(TABLE.ensWatchers.user_id, c.var.user_id),
            eq(TABLE.ensWatchers.name, name),
          ),
        )
        .returning()

      if (result.length === 0) {
        return c.json({ error: 'Watcher not found' }, 404)
      }

      // Check if there are any other watchers for this name
      const remainingWatchers = await c.var.db
        .select()
        .from(TABLE.ensWatchers)
        .where(eq(TABLE.ensWatchers.name, name))
        .limit(1)

      // If no watchers left, remove eval pointer
      if (remainingWatchers.length === 0) {
        await c.var.db
          .delete(TABLE.ensEvalPointers)
          .where(eq(TABLE.ensEvalPointers.name, name))
      }

      return c.json({ message: 'Successfully removed from watchlist' })
    } catch (error) {
      console.error('Error removing watcher:', error)
      return c.json({ error: 'Failed to remove watcher' }, 500)
    }
  })
