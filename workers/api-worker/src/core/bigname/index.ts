import { type BignameClient, createBignameClient } from '@ens-apps/bigname'
import { getConfig } from '../config'

/**
 * bigname REST client for this worker. The base URL is the network profile's
 * `endpoints.bignameApi`, resolved by `getConfig` from the `CHAIN` binding.
 */
export const createBigname = (env: CloudflareBindings): BignameClient =>
  createBignameClient({ baseUrl: getConfig(env).endpoints.bignameApi })
