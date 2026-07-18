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
    /**
     * Zodiac Roles hardening (see services/crossmint/roles.ts). When set, the
     * treasury Safe is the payer and all fulfilment writes are routed through
     * the Roles modifier; when unset, the worker runs in direct-EOA mode.
     * Public addresses (not secrets) — set both or neither.
     */
    REGISTRAR_SAFE_ADDRESS?: string
    /** Zodiac Roles v2 modifier enabled on the treasury Safe. */
    REGISTRAR_ROLES_MODULE_ADDRESS?: string
    /** Optional bytes32 role-key override (defaults to "ens-crossmint-registrar"). */
    REGISTRAR_ROLES_ROLE_KEY?: string
    /**
     * Explicit opt-in to direct-EOA signing when the Role vars are absent
     * (local dev / standalone scripts). Without it, missing Role vars fail
     * closed rather than silently signing from ETH_PRIVATE_KEY.
     */
    ALLOW_DIRECT_EOA_SIGNER?: string
  }
}
