import { buildConfig, type EnsAppConfig } from '@ens-apps/config'

/**
 * The worker's composition root for network configuration.
 *
 * Unlike the browser apps, the worker resolves per request from its Cloudflare
 * bindings rather than at build time. It shares `buildConfig` with them, and
 * takes the indexer endpoint from the network profile alone: a binding used to
 * override it, and pointed at a retired host for months while the apps read
 * staging, so the hourly expiry cron failed on every run.
 */
export const getConfig = (env: CloudflareBindings): EnsAppConfig =>
  buildConfig({
    network: env.CHAIN,
    rpcUrl: env.SEPOLIA_RPC_URL,
  })
