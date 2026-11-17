import {
  createBignameIndexer,
  createGoldskyIndexer,
  createZigensIndexer,
  type IndexerClient,
} from '@ens-apps/indexer'
import { match } from 'ts-pattern'
import { getChainContractAddress } from 'viem'
import { chain, indexerSelection } from '@/config'
import { publicClient } from '@/lib/wagmi'

/** The indexer this build reads, picked in `@/config` (`VITE_INDEXER`). */
export const indexer: IndexerClient = match(indexerSelection)
  .with({ backend: 'bigname' }, ({ bignameApi }) =>
    createBignameIndexer({ baseUrl: bignameApi, chainId: chain.id }),
  )
  .with({ backend: 'goldsky' }, ({ goldskyApi }) =>
    createGoldskyIndexer({ baseUrl: goldskyApi, chainId: chain.id }),
  )
  .with({ backend: 'zigens' }, ({ zigensGraphql, ensNodeSubgraph }) =>
    createZigensIndexer({
      zigensGraphql,
      ensNodeSubgraph,
      chainId: chain.id,
      nameWrapper: getChainContractAddress({
        chain,
        contract: 'ensNameWrapper',
      }),
      rpcClient: publicClient,
    }),
  )
  .exhaustive()
