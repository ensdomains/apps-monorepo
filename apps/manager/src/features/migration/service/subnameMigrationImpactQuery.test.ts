import type { SubnameMigrationImpact } from '@ens-apps/migration'
import {
  onlineManager,
  QueryClient,
  QueryObserver,
} from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import {
  getSubnameMigrationImpactQueryOptions,
  publishPreparedSubnameImpact,
} from './subnameMigrationImpactQuery'

const deferred = <T>() => {
  let resolve = (_value: T): void => {}
  let reject = (_reason: unknown): void => {}
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

const scope = {
  ownerAddress: '0x0000000000000000000000000000000000000001',
  chainId: 1,
  migratingNames: ['alice.eth', 'bob.eth'],
  copiedNames: [],
  renewingNames: [],
}
const options = {
  ...scope,
  isEnabled: true,
  isPrepared: true,
  hasSelectedNames: true,
}
const impact = (checkedAt = Date.now()): SubnameMigrationImpact => ({
  parents: [],
  affectedCount: 0,
  unrecoverable: [],
  fingerprint: 'verified',
  checkedAt,
})

describe('prepared subname impact evidence', () => {
  it('leaves an offline verification pending instead of publishing over it', async () => {
    const client = new QueryClient()
    const query = getSubnameMigrationImpactQueryOptions(options)
    onlineManager.setOnline(false)
    const pending = client
      .fetchQuery({ ...query, queryFn: () => Promise.resolve(impact()) })
      .catch(() => undefined)
    try {
      expect(client.getQueryState(query.queryKey)?.fetchStatus).toBe('paused')
      publishPreparedSubnameImpact({
        queryClient: client,
        ...scope,
        impact: impact(),
      })
      expect(client.getQueryState(query.queryKey)?.status).toBe('pending')
      expect(client.getQueryData(query.queryKey)).toBeUndefined()
    } finally {
      await client.cancelQueries({ queryKey: query.queryKey })
      await pending
      onlineManager.setOnline(true)
    }
  })
  it('shares normalized sets but separates owner, chain and every migration input', () => {
    const key = getSubnameMigrationImpactQueryOptions(options).queryKey
    expect(
      getSubnameMigrationImpactQueryOptions({
        ...options,
        migratingNames: ['BOB.eth', 'alice.eth', 'bob.eth'],
      }).queryKey,
    ).toEqual(key)
    for (const change of [
      { ownerAddress: 'other' },
      { chainId: 2 },
      { migratingNames: ['alice.eth'] },
      { copiedNames: ['sub.alice.eth'] },
      { renewingNames: ['alice.eth'] },
    ]) {
      expect(
        getSubnameMigrationImpactQueryOptions({ ...options, ...change })
          .queryKey,
      ).not.toEqual(key)
    }
  })

  it('reuses preparation for display, retaining its age and forcing a fresh recheck when requested', async () => {
    const client = new QueryClient()
    const evidence = impact()
    publishPreparedSubnameImpact({
      queryClient: client,
      ...scope,
      impact: evidence,
    })
    const read = vi.fn().mockResolvedValue({ ...evidence, affectedCount: 1 })
    const query = {
      ...getSubnameMigrationImpactQueryOptions(options),
      queryFn: read,
    }
    const observer = new QueryObserver(client, query)
    const unsubscribe = observer.subscribe(() => {})
    expect(observer.getCurrentResult().data).toEqual(evidence)
    expect(read).not.toHaveBeenCalled()
    expect(client.getQueryState(query.queryKey)?.dataUpdatedAt).toBe(
      evidence.checkedAt,
    )
    await client.refetchQueries({ queryKey: query.queryKey })
    expect(read).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(query.queryKey)).toMatchObject({
      affectedCount: 1,
    })
    unsubscribe()
  })

  it('does not clear a newer failed verification with older preparation evidence', async () => {
    const client = new QueryClient()
    const evidence = impact(Date.now() - 1000)
    const query = getSubnameMigrationImpactQueryOptions(options)
    await expect(
      client.fetchQuery({
        ...query,
        retry: false,
        queryFn: () => Promise.reject(new Error('Indexer unavailable')),
      }),
    ).rejects.toThrow('Indexer unavailable')
    publishPreparedSubnameImpact({
      queryClient: client,
      ...scope,
      impact: evidence,
    })
    expect(client.getQueryState(query.queryKey)?.status).toBe('error')
    expect(client.getQueryData(query.queryKey)).toBeUndefined()
  })

  it('does not replace newer evidence or a live verification', async () => {
    const client = new QueryClient()
    const query = getSubnameMigrationImpactQueryOptions(options)
    const newer = impact(Date.now() + 1)
    client.setQueryData(query.queryKey, newer)
    publishPreparedSubnameImpact({
      queryClient: client,
      ...scope,
      impact: impact(newer.checkedAt - 1),
    })
    expect(client.getQueryData(query.queryKey)).toEqual(newer)
    const response = deferred<SubnameMigrationImpact>()
    const running = client.fetchQuery({
      ...query,
      staleTime: 0,
      queryFn: () => response.promise,
    })
    publishPreparedSubnameImpact({
      queryClient: client,
      ...scope,
      impact: impact(newer.checkedAt + 1),
    })
    expect(client.getQueryData(query.queryKey)).toEqual(newer)
    response.resolve({ ...newer, affectedCount: 1 })
    await running
    expect(client.getQueryData(query.queryKey)).toMatchObject({
      affectedCount: 1,
    })
  })

  it('refreshes expired preparation evidence instead of extending its lifetime', async () => {
    const client = new QueryClient()
    publishPreparedSubnameImpact({
      queryClient: client,
      ...scope,
      impact: impact(Date.now() - 61_000),
    })
    const read = vi.fn().mockResolvedValue({ ...impact(), affectedCount: 1 })
    expect(
      await client.fetchQuery({
        ...getSubnameMigrationImpactQueryOptions(options),
        queryFn: read,
      }),
    ).toMatchObject({ affectedCount: 1 })
    expect(read).toHaveBeenCalledTimes(1)
  })
})
