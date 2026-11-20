import { createBignameClient } from '@ens-apps/indexer/bigname'
import { envConfig } from '@/config'

const REQUEST_TIMEOUT_MS = 15_000

/** The caller's signal still cancels the request; the timeout only adds a limit. */
export const withTimeout = (init: RequestInit | undefined): RequestInit => ({
  ...init,
  signal: AbortSignal.any([
    ...(init?.signal ? [init.signal] : []),
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  ]),
})

/** Raw bigname, only for the ENSv1 migration reads that need its lookup records; everything else reads `@/lib/indexer`. */
export const bigname = createBignameClient(envConfig.endpoints.bignameApi, {
  fetch: (input, init) => fetch(input, withTimeout(init)),
})
