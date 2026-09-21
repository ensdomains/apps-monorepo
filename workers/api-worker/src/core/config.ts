import { buildConfig, type EnsAppConfig } from '@ens-apps/config'

/**
 * The worker's composition root for network configuration.
 *
 * Unlike the browser apps, the worker resolves per request from its Cloudflare
 * bindings rather than at build time. It shares `buildConfig` with them so the
 * indexer endpoint and chain cannot drift between the two: before this, the
 * worker defaulted to the production indexer while the apps defaulted to
 * staging, and nothing reconciled them.
 */
export const getConfig = (env: CloudflareBindings): EnsAppConfig =>
  buildConfig({
    network: env.CHAIN,
    rpcUrl: env.SEPOLIA_RPC_URL || undefined,
    overrides: { indexerGraphql: env.ENS_INDEXER_GRAPHQL_URL || undefined },
  })
