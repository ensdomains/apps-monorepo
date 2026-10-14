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

const url = envConfig.endpoints.bignameApi

// Null on a network with no bigname deployed: its reads fail here rather than
// reach another network's indexer.
export const bigname = createBignameClient(url ?? '', {
  fetch: (input, init) =>
    url
      ? fetch(input, withTimeout(init))
      : Promise.reject(
          new Error(`No bigname API is deployed for ${envConfig.network}`),
        ),
})
