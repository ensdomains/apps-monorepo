import { buildConfig, type EnsAppConfig } from '@ens-apps/config'

/**
 * The worker's composition root for network configuration.
 *
 * Unlike the browser apps, the worker resolves per request from its Cloudflare
 * bindings rather than at build time. It shares `buildConfig` with them, and
 * takes the bigname endpoint from the network profile alone: a binding used to
 * override the old indexer's, and pointed at a retired host for months while the apps read
 * staging, so the hourly expiry cron failed on every run.
 */
export const getConfig = (env: CloudflareBindings): EnsAppConfig =>
  buildConfig({
    network: env.CHAIN,
    rpcUrl: env.CHAIN === 'sepolia' ? env.SEPOLIA_RPC_URL : undefined,
  })
