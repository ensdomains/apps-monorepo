import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { invalidateResolverOverview } from './invalidateResolverOverview'

const ADDRESS = '0x04fef474165a49fe054280868891de52454ca7d5'

describe('invalidateResolverOverview', () => {
  it('marks the overview and the paged history stale, and nothing else', async () => {
    const queryClient = new QueryClient()
    const overviewKey = ['resolver-overview', { address: ADDRESS }]
    const historyKey = ['get-contract-history-timeline', { address: ADDRESS }]
    const unrelatedKey = ['get-names-for-address', { address: ADDRESS }]
    for (const key of [overviewKey, historyKey, unrelatedKey])
      queryClient.setQueryData(key, {})

    await invalidateResolverOverview(queryClient)

    expect(queryClient.getQueryState(overviewKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(historyKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(unrelatedKey)?.isInvalidated).toBe(false)
  })
})
