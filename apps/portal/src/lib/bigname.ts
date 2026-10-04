import { createBignameClient } from '@ens-apps/bigname'
import { envConfig } from '@/config'

/** Portal's bigname REST client, bound to the endpoint resolved in `@/config`. */
export const bigname = createBignameClient({
  baseUrl: envConfig.endpoints.bignameApi,
})
