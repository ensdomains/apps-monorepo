import { createBignameClient } from '@ens-apps/indexer/bigname'
import { envConfig } from '@/config'

const REQUEST_TIMEOUT_MS = 15_000

export const bigname = createBignameClient(envConfig.endpoints.bignameApi, {
  fetch: (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
})
