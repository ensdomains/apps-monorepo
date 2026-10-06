import { createBignameClient } from '@ens-apps/indexer/bigname'
import { envConfig } from '@/config'

export const bigname = createBignameClient(envConfig.endpoints.bignameApi)
