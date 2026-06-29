import { drizzle } from 'drizzle-orm/d1'
import { crossmintOrders } from './schema/crossmint'

/**
 * The Crossmint feature uses a dedicated D1 (SQLite) database, bound as
 * `CROSSMINT_DB` in wrangler.jsonc — separate from the worker's Neon/Postgres
 * connection (`getDatabase`). It owns exactly one table (`crossmint_orders`),
 * so there's no cross-DB query; the only required runtime secret stays
 * `ETH_PRIVATE_KEY` (D1 is a binding, not a connection-string secret).
 */
export const crossmintDbSchema = { crossmintOrders }

export function getCrossmintDb(env: CloudflareBindings) {
  return drizzle(env.CROSSMINT_DB, { schema: crossmintDbSchema })
}

export type CrossmintDb = ReturnType<typeof getCrossmintDb>
