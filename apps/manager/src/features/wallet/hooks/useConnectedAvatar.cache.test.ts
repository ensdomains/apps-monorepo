import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_UPLOAD_BASE_URL } from '@/features/profile/constants'
import { refreshProfileImageCaches } from '@/features/profile/service/profileImageCache'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { useConnectedAvatar } from './useConnectedAvatar'

vi.mock('@/features/wallet/hooks/useConnectedReverseName', () => ({
  useConnectedReverseName: () => ({
    data: 'test.eth',
    isLoading: false,
    error: null,
  }),
}))

vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return { safeGetClient: () => ok({}) }
})

const clients: QueryClient[] = []
const renderAvatar = (avatar: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  clients.push(queryClient)
  const queryKey = profileRecordsQuery('test.eth').queryKey
  queryClient.setQueryData(queryKey, {
    texts: [{ key: 'avatar', value: avatar }],
    coins: [],
  })
  const hook = renderHook(() => useConnectedAvatar(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  })
  return { ...hook, queryClient, queryKey }
}

afterEach(() => {
  cleanup()
  for (const client of clients) client.clear()
  clients.length = 0
  vi.restoreAllMocks()
})

describe('connected avatar cache', () => {
  it('switches to the saved avatar record and clears a removed avatar', async () => {
    const { result, queryClient, queryKey } = renderAvatar(
      'https://example.com/old.png',
    )
    await waitFor(() =>
      expect(result.current.url).toBe('https://example.com/old.png'),
    )

    act(() =>
      queryClient.setQueryData(queryKey, {
        texts: [{ key: 'avatar', value: 'https://example.com/new.png' }],
        coins: [],
      }),
    )
    await waitFor(() =>
      expect(result.current.url).toBe('https://example.com/new.png'),
    )

    act(() => queryClient.setQueryData(queryKey, { texts: [], coins: [] }))
    await waitFor(() => expect(result.current.url).toBeUndefined())
  })

  it('refreshes an overwritten upload without changing the avatar record', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}/test.eth`
    const { result, queryClient } = renderAvatar(imageUrl)
    await waitFor(() => expect(result.current.url).toBe(imageUrl))

    await act(() =>
      refreshProfileImageCaches({
        images: [{ kind: 'avatar', imageUrl }],
        queryClient,
      }),
    )
    await waitFor(() => expect(result.current.url).toBe(`${imageUrl}?v=1234`))
  })
})
