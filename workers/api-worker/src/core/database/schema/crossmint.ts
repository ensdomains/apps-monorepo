import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Lifecycle of a credit-card (Crossmint) registration order.
 *
 *   pending     -> intent created by the frontend pre-checkout (our row id is
 *                  the clientReference handed to Crossmint); awaiting payment
 *   paid        -> webhook received, payment settled, voucher minted
 *   committing  -> commit tx submitted on the user's behalf
 *   committed   -> commit confirmed, waiting out MIN_COMMITMENT_AGE
 *   registering -> register tx submitted
 *   registered  -> name delivered to the buyer's wallet, voucher burned
 *   failed      -> terminal error (see `error`)
 */
export type CrossmintOrderStatus =
  | 'pending'
  | 'paid'
  | 'committing'
  | 'committed'
  | 'registering'
  | 'registered'
  | 'failed'

/**
 * Crossmint orders live in a dedicated D1 (SQLite) database, separate from the
 * worker's Neon/Postgres tables. The feature touches only this one table and
 * needs no Postgres features, so D1 keeps it self-contained (and the shared
 * Neon DB untouched). UUIDs + timestamps are app-generated (SQLite has no
 * server-side equivalents).
 */
export const crossmintOrders = sqliteTable(
  'crossmint_orders',
  {
    /** Canonical order id (UUID, app-generated); also the Crossmint clientReference. */
    id: text('id').primaryKey(),
    /** Crossmint's own order id, recorded on payment (for reference/debugging). */
    crossmint_order_id: text('crossmint_order_id').unique(),
    /** Resolved ENS user id (best-effort; no cross-DB FK to the Neon users table). */
    user_id: text('user_id'),
    /** Delivery wallet — the name is registered to this address. Lowercased. */
    owner_address: text('owner_address').notNull(),
    /** Plaintext label being registered (server-side only; never on-chain). */
    name: text('name').notNull(),
    /** Registration period in seconds. */
    duration: integer('duration').notNull(),
    /** Commit-reveal secret (0x hex). Persisted so register can reveal it. */
    secret: text('secret').notNull(),
    /** The computed commit-reveal commitment (0x hex). */
    commitment: text('commitment'),
    /** Resolver used for the registration. */
    resolver_address: text('resolver_address'),
    /** ERC-20 the registrar was paid in (e.g. USDC). */
    payment_token: text('payment_token'),
    /** Voucher tokenId minted by Crossmint, burned after delivery. */
    voucher_token_id: text('voucher_token_id'),
    /** ETH (wei) the voucher contract received, for reconciliation. */
    amount_paid: text('amount_paid'),
    commit_tx_hash: text('commit_tx_hash'),
    register_tx_hash: text('register_tx_hash'),
    status: text('status')
      .$type<CrossmintOrderStatus>()
      .notNull()
      .default('pending'),
    error: text('error'),
    committed_at: integer('committed_at', { mode: 'timestamp' }),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('crossmint_orders_user_id_index').on(table.user_id),
    index('crossmint_orders_owner_address_index').on(table.owner_address),
    index('crossmint_orders_status_index').on(table.status),
  ],
)
