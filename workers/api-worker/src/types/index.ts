export * from './events/index'
export * from './helpers'

// Additive augmentation of the wrangler-generated `CloudflareBindings` for the
// Crossmint credit-card checkout. Declared here (a file already in both the
// typecheck and declaration-build include sets) rather than regenerating
// worker-configuration.gen.d.ts, so we don't drop other inferred secrets.
//
// - REGISTRATION_QUEUE: producer binding declared in wrangler.jsonc.
// - CROSSMINT_WEBHOOK_SECRET: optional Svix secret; the worker still boots (and
//   the webhook stays unsigned) when it's unset. The publishable client key,
//   collection id, and voucher address are inlined in code (not secrets), and
//   the only required secret is ETH_PRIVATE_KEY (the server wallet).
declare global {
  interface CloudflareBindings {
    REGISTRATION_QUEUE: Queue
    /** Dedicated D1 (SQLite) database for crossmint_orders. */
    CROSSMINT_DB: D1Database
    /** Svix signing secret for verifying Crossmint webhooks (`whsec_...`). */
    CROSSMINT_WEBHOOK_SECRET?: string
  }
}
