import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nameRowRecordsQuery } from '@/features/dashboard/components/nameRowRecordsQuery'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { updateProfileImageRecords } from './profileImageCache'
import { profileRecordsQuery } from './profileRecords'

vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return { safeGetClient: () => ok({}) }
})

const queryClient = new QueryClient()
afterEach(() => queryClient.clear())

describe('saved profile image records', () => {
  it('updates full and partial caches before refetching while preserving other records', async () => {
    const fullKey = profileRecordsQuery('test.eth').queryKey
    const rowKey = nameRowRecordsQuery('test.eth').queryKey
    const otherKey = profileRecordsQuery('other.eth').queryKey
    const previous = {
      texts: [
        { key: 'avatar', value: 'https://example.com/old.png' },
        { key: 'header', value: 'https://example.com/old-header.png' },
        { key: 'theme', value: '#123456' },
        { key: 'description', value: 'Keep this description' },
      ],
      coins: [{ coinType: 60, value: '0x1234' }],
    }
    queryClient.setQueryData(fullKey, previous)
    queryClient.setQueryData(rowKey, { texts: previous.texts.slice(0, 3) })
    queryClient.setQueryData(otherKey, previous)

    await updateProfileImageRecords({
      name: 'test.eth',
      queryClient,
      records: {
        ...newEmptyProfileRecords(),
        base: {
          avatar: 'https://example.com/new.png',
          header: 'ipfs://new-header',
          theme: '#654321',
        },
      },
    })

    const texts = [
      { key: 'avatar', value: 'https://example.com/new.png' },
      { key: 'header', value: 'ipfs://new-header' },
      { key: 'theme', value: '#654321' },
    ]
    expect(queryClient.getQueryData(fullKey)).toEqual({
      ...previous,
      texts: [{ key: 'description', value: 'Keep this description' }, ...texts],
    })
    expect(queryClient.getQueryData(rowKey)).toEqual({ texts })
    expect(queryClient.getQueryData(otherKey)).toEqual(previous)
  })

  it('removes cleared image records and prevents a pending lookup from restoring them', async () => {
    const queryKey = profileRecordsQuery('test.eth').queryKey
    const previous = {
      texts: [
        { key: 'avatar', value: 'https://example.com/old.png' },
        { key: 'header', value: 'https://example.com/old-header.png' },
      ],
      coins: [],
    }
    queryClient.setQueryData(queryKey, previous)
    let resolveRecords: ((value: typeof previous) => void) | undefined
    const pending = queryClient
      .fetchQuery({
        queryKey,
        queryFn: () =>
          new Promise<typeof previous>((resolve) => {
            resolveRecords = resolve
          }),
      })
      .catch(() => undefined)

    await updateProfileImageRecords({
      name: 'test.eth',
      queryClient,
      records: newEmptyProfileRecords(),
    })
    resolveRecords?.(previous)
    await pending

    expect(queryClient.getQueryData(queryKey)).toEqual({ texts: [], coins: [] })
  })
})
