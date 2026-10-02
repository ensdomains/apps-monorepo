import {
  QueryClient,
  QueryClientProvider,
  skipToken,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_UPLOAD_BASE_URL } from '@/features/profile/constants'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import { refreshProfileImageCaches } from '@/features/profile/service/profileImageCache'
import { useConnectedAvatar } from './useConnectedAvatar'

vi.mock('@/features/wallet/hooks/useConnectedReverseName', () => ({
  useConnectedReverseName: () => ({
    data: 'beagle.eth',
    error: null,
    isLoading: false,
  }),
}))

vi.mock('@/features/profile/service/profileRecords', () => ({
  profileRecordsQuery: () => ({
    queryKey: ['connected-profile-records'],
    queryFn: skipToken,
  }),
}))

vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: vi.fn() }))

describe('connected avatar upload refresh', () => {
  afterEach(() => vi.restoreAllMocks())

  it('updates a mounted wallet avatar when its primary name image is replaced', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result, unmount } = renderHook(() => useConnectedAvatar(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children),
    })
    expect(result.current.url).toBe(buildNameAvatarUrl('beagle.eth'))
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}/sepolia/beagle.eth`

    await act(async () => {
      await refreshProfileImageCaches({
        images: [{ kind: 'avatar', imageUrl, name: 'beagle.eth' }],
        queryClient,
      })
    })

    await waitFor(() => expect(result.current.url).toBe(`${imageUrl}?v=1234`))
    unmount()
    queryClient.clear()
  })
})
