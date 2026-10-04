import { createBignameClient } from '@ens-apps/bigname'
import { envConfig } from '@/config'

/** The manager's bigname client, bound to the endpoint resolved in `@/config`. */
export const bigname = createBignameClient({
  baseUrl: envConfig.endpoints.bignameApi,
})
