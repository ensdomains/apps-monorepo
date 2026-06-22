// Ambient binding augmentation for the Rhinestone JWT issuer (FET-3334).
//
// These are provided at runtime as Worker secrets / `.dev.vars` entries (see
// `.dev.vars.example`). They are declared here — rather than via
// `wrangler types` into `worker-configuration.gen.d.ts` — so they survive a
// regeneration of that file without conflict: `wrangler types` types
// `.dev.vars` entries as `string`, which is identical to these declarations, so
// interface merging stays conflict-free whether or not a future regen includes
// them.
//
// This file must remain a global ambient script (no imports/exports) so the
// declarations merge into the generated `Cloudflare.Env`.
declare namespace Cloudflare {
  interface Env {
    /** Rhinestone integrator id — signed as the JWT `iss`. */
    RHINESTONE_INTEGRATOR_ID: string
    /** Rhinestone project id — signed as the JWT `sub`. */
    RHINESTONE_PROJECT_ID: string
    /** Rhinestone app id — signed into the `app_id` claim. */
    RHINESTONE_APP_ID: string
    /** Optional JWT audience; the SDK defaults to `rhinestone-api` when blank. */
    RHINESTONE_JWT_AUDIENCE: string
    /**
     * `keyId` of the active signing key within `RHINESTONE_JWT_SIGNING_KEYS`.
     * Rotating keys means changing this id, not redeploying code.
     */
    RHINESTONE_JWT_ACTIVE_KEY_ID: string
    /**
     * JSON array of `{ keyId, privateKey }` where `privateKey` is a JWK.
     * Holding every registered key here and selecting one by id gives
     * zero-downtime `kid` rotation.
     */
    RHINESTONE_JWT_SIGNING_KEYS: string
    /** CSV of chain ids eligible for sponsorship, e.g. `"1,11155111"`. */
    RHINESTONE_SPONSORSHIP_CHAIN_IDS: string
  }
}
