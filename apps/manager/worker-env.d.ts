/**
 * Ambient type for the orchestrator-proxy runtime secret.
 *
 * `RHINESTONE_API_KEY` is a deploy-time secret (set via
 * `wrangler secret put RHINESTONE_API_KEY`) with no local default, so
 * `wrangler types` does not emit it into worker-configuration.gen.d.ts.
 * Declare it here so `env.RHINESTONE_API_KEY` is typed in server code.
 */

declare namespace Cloudflare {
  interface Env {
    RHINESTONE_API_KEY: string
  }
}
