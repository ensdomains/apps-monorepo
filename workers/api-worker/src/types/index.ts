export * from './events/index'
export * from './helpers'

// Additive augmentation of the wrangler-generated `CloudflareBindings` for the
// Crossmint credit-card checkout. Declared here (a file already in both the
// typecheck and declaration-build include sets) rather than regenerating
// worker-configuration.gen.d.ts, so we don't drop other inferred secrets.
//
// - REGISTRATION_QUEUE: producer binding declared in wrangler.jsonc.
// - CROSSMINT_*: secrets (set via `wrangler secret put` / `.dev.vars`); optional
//   so the worker still boots when they're unset (mocked / pre-credentials).
declare global {
  interface CloudflareBindings {
    REGISTRATION_QUEUE: Queue
    /** Svix signing secret for verifying Crossmint webhooks (`whsec_...`). */
    CROSSMINT_WEBHOOK_SECRET?: string
    /** Crossmint server API key (orders.create scope) for the Orders API. */
    CROSSMINT_API_KEY?: string
    /** Deployed BYOC voucher contract address (enables voucher burn). */
    CROSSMINT_VOUCHER_ADDRESS?: string
  }
}
