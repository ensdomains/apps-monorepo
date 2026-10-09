import { QueryClient } from '@tanstack/react-query'
import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { invalidateResolverOverview } from './invalidateResolverOverview'

const RESOLVER = '0x04fef474165a49fe054280868891de52454ca7d5'
const OTHER_CONTRACT = '0x1cf3000000000000000000000000000000001acf'

describe('invalidateResolverOverview', () => {
  it('marks the overview and this resolver’s paged history and nodes stale, and nothing else', async () => {
    const queryClient = new QueryClient()
    const overviewKey = ['resolver-overview', { address: RESOLVER }]
    const historyKey = ['get-contract-history-timeline', { address: RESOLVER }]
    const nodesKey = ['get-resolver-nodes', { address: RESOLVER }]
    const otherHistoryKey = [
      'get-contract-history-timeline',
      { address: OTHER_CONTRACT },
    ]
    const unrelatedKey = ['get-names-for-address', { address: RESOLVER }]
    for (const key of [
      overviewKey,
      historyKey,
      nodesKey,
      otherHistoryKey,
      unrelatedKey,
    ])
      queryClient.setQueryData(key, {})

    await invalidateResolverOverview(queryClient, getAddress(RESOLVER))

    expect(queryClient.getQueryState(overviewKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(historyKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(nodesKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(otherHistoryKey)?.isInvalidated).toBe(
      false,
    )
    expect(queryClient.getQueryState(unrelatedKey)?.isInvalidated).toBe(false)
  })

  it('skips a scoped query whose key carries no address', async () => {
    const queryClient = new QueryClient()
    const bareKey = ['get-resolver-nodes']
    queryClient.setQueryData(bareKey, {})

    await invalidateResolverOverview(queryClient, getAddress(RESOLVER))

    expect(queryClient.getQueryState(bareKey)?.isInvalidated).toBe(false)
  })
})
