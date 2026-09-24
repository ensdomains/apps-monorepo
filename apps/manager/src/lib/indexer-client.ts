import { createIndexerClient } from '@ens-apps/indexer/urql'
import { envConfig } from '@/config'

/**
 * The manager's ENSv2 indexer client, bound to the endpoint resolved in
 * `@/config`.
 */
export const indexerClient = createIndexerClient(
  envConfig.endpoints.indexerGraphql,
)
