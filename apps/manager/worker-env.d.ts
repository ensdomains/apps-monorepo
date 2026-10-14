// Bindings `wrangler types` cannot see: secrets have no local default, and the
// rate limiter is declared in wrangler.jsonc but typed here so a regenerated
// worker-configuration.gen.d.ts and this file agree.
declare namespace Cloudflare {
  interface Env {
    /** JSON-encoded private JWK registered with Rhinestone (ES256). */
    RHINESTONE_JWT_PRIVATE_KEY?: string
    RHINESTONE_INTEGRATOR_ID?: string
    RHINESTONE_PROJECT_ID?: string
    RHINESTONE_APP_ID?: string
    RHINESTONE_KEY_ID?: string
    RHINESTONE_TOKEN_RATE_LIMIT?: RateLimit
  }
}
