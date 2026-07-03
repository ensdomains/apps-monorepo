import { and, count, countDistinct, eq, gte } from 'drizzle-orm'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { schema } from '#core/database/index.js'
import { logger } from '#utils/logger.js'

const SEARCH_STATS_WINDOW_DAYS = 30

/** UTC date (YYYY-MM-DD) marking the start of the search-stats window. */
function searchWindowStart(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - SEARCH_STATS_WINDOW_DAYS)
  return d.toISOString().slice(0, 10)
}

/** Salted SHA-256 hex digest of a searcher identity — avoids storing raw PII. */
async function hashSearcher(identity: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${identity}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}

export default createApp()
  .basePath('/names')
  // Public aggregate stats for the price-cooldown "name stats" panel.
  // No auth: only anonymous aggregate counts are exposed.
  .get('/:name/stats', injectDb, async (c) => {
    const { name } = c.req.param()

    const [[favoriteCount], [searchCount]] = await Promise.all([
      c.var.db
        .select({ value: count() })
        .from(schema.favorites)
        .where(eq(schema.favorites.name, name)),
      c.var.db
        .select({ value: countDistinct(schema.nameSearches.searcher_hash) })
        .from(schema.nameSearches)
        .where(
          and(
            eq(schema.nameSearches.name, name),
            gte(schema.nameSearches.searched_on, searchWindowStart()),
          ),
        ),
    ])

    return c.json({
      name,
      favorites: favoriteCount?.value ?? 0,
      unique_searches_last_30d: searchCount?.value ?? 0,
    })
  })
  // Record a search for a name. Public; deduped per searcher per day via the
  // (name, searcher_hash, searched_on) PK, so it is safe to call on every
  // search without inflating counts.
  .post('/:name/searches', injectDb, async (c) => {
    const { name } = c.req.param()

    const ip =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for') ??
      'unknown'
    const userAgent = c.req.header('user-agent') ?? ''
    const searcher_hash = await hashSearcher(
      `${ip}:${userAgent}`,
      c.env.JWT_SECRET,
    )

    logger.debug('Recording name search', { name })

    await c.var.db
      .insert(schema.nameSearches)
      .values({ name, searcher_hash })
      .onConflictDoNothing()

    return c.json({ message: 'Search recorded' }, 200)
  })
