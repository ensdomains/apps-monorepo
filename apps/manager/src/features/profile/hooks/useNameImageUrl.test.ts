import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_UPLOAD_BASE_URL } from '@/features/profile/constants'
import { refreshProfileImageCaches } from '@/features/profile/service/profileImageCache'
import {
  cacheSavedProfileImages,
  savedProfileImagesQuery,
} from '@/features/profile/service/profileSavedImages'
import { useNameImageUrl } from './useNameImageUrl'

vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: vi.fn() }))

describe('name image refresh across app views', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  afterEach(() => {
    queryClient.clear()
    vi.restoreAllMocks()
  })

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)

  it('updates multiple mounted avatar views while leaving the header and other names alone', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const { result } = renderHook(
      () => ({
        wallet: useNameImageUrl({
          name: 'beagle.eth',
          kind: 'avatar',
          fallbackUrl: 'old-avatar',
        }),
        dashboard: useNameImageUrl({
          name: 'beagle.eth',
          kind: 'avatar',
          fallbackUrl: 'old-avatar',
        }),
        header: useNameImageUrl({
          name: 'beagle.eth',
          kind: 'header',
          fallbackUrl: 'old-header',
        }),
        other: useNameImageUrl({
          name: 'other.eth',
          kind: 'avatar',
          fallbackUrl: 'other-avatar',
        }),
      }),
      { wrapper },
    )
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}/sepolia/beagle.eth`

    await act(async () => {
      await refreshProfileImageCaches({
        images: [{ name: 'beagle.eth', kind: 'avatar', imageUrl }],
        queryClient,
      })
    })

    await waitFor(() =>
      expect(result.current).toEqual({
        wallet: `${imageUrl}?v=1234`,
        dashboard: `${imageUrl}?v=1234`,
        header: 'old-header',
        other: 'other-avatar',
      }),
    )
  })

  it.each([
    'avatar',
    'header',
  ] as const)('uses a newly saved %s URL, then suppresses its metadata fallback on removal', async (kind) => {
    const { result } = renderHook(
      () =>
        useNameImageUrl({
          name: 'beagle.eth',
          kind,
          fallbackUrl: 'old-metadata-image',
        }),
      { wrapper },
    )
    expect(result.current).toBe('old-metadata-image')

    act(() =>
      cacheSavedProfileImages({
        name: 'beagle.eth',
        images: { [kind]: 'https://example.com/new-image.png' },
        queryClient,
      }),
    )
    await waitFor(() =>
      expect(result.current).toBe('https://example.com/new-image.png'),
    )

    act(() =>
      cacheSavedProfileImages({
        name: 'beagle.eth',
        images: { [kind]: '' },
        queryClient,
      }),
    )
    await waitFor(() => expect(result.current).toBeUndefined())
  })

  it('keeps the latest version when a previously edited name is shown again', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}/sepolia/beagle.eth/h`
    const images = [{ name: 'beagle.eth', kind: 'header' as const, imageUrl }]
    await refreshProfileImageCaches({ images, queryClient })
    await refreshProfileImageCaches({ images, queryClient })
    const { result, rerender } = renderHook(
      ({ name }) =>
        useNameImageUrl({
          name,
          kind: 'header',
          fallbackUrl: `metadata-${name}`,
        }),
      { wrapper, initialProps: { name: 'other.eth' } },
    )
    expect(result.current).toBe('metadata-other.eth')

    rerender({ name: 'BEAGLE.eth' })
    await waitFor(() => expect(result.current).toBe(`${imageUrl}?v=1235`))
  })

  it('does not expose an uploaded image for a name before its record is saved', async () => {
    const { result } = renderHook(
      () =>
        useNameImageUrl({
          name: 'beagle.eth',
          kind: 'avatar',
          fallbackUrl: 'saved-metadata-image',
        }),
      { wrapper },
    )
    await act(async () => {
      await refreshProfileImageCaches({
        images: [
          {
            kind: 'avatar',
            imageUrl: `${AVATAR_UPLOAD_BASE_URL}/sepolia/beagle.eth`,
          },
        ],
        queryClient,
      })
    })
    expect(result.current).toBe('saved-metadata-image')
  })

  it('respects views which suppress an image by omitting the name', async () => {
    cacheSavedProfileImages({
      name: 'beagle.eth',
      images: { avatar: 'https://example.com/new-image.png' },
      queryClient,
    })
    const { result } = renderHook(
      () => useNameImageUrl({ name: undefined, kind: 'avatar' }),
      { wrapper },
    )
    expect(result.current).toBeUndefined()
  })

  it('follows later resolver changes after a read acknowledges the saved image', async () => {
    const name = 'beagle.eth'
    const recordsKey = qk('profile', 'get_records', { name })
    cacheSavedProfileImages({
      name,
      images: { avatar: 'https://example.com/saved.png' },
      queryClient,
    })
    const { result } = renderHook(
      () =>
        useNameImageUrl({
          name,
          kind: 'avatar',
          fallbackUrl: 'old-metadata-image',
        }),
      { wrapper },
    )
    await waitFor(() =>
      expect(result.current).toBe('https://example.com/saved.png'),
    )

    // A lookup started before the save must not restore its previous value.
    act(() =>
      queryClient.setQueryData(recordsKey, {
        texts: [{ key: 'avatar', value: 'https://example.com/old.png' }],
      }),
    )
    expect(result.current).toBe('https://example.com/saved.png')

    act(() =>
      queryClient.setQueryData(recordsKey, {
        texts: [{ key: 'avatar', value: 'https://example.com/saved.png' }],
      }),
    )
    act(() =>
      queryClient.setQueryData(recordsKey, {
        texts: [{ key: 'avatar', value: 'https://example.com/later.png' }],
      }),
    )
    await waitFor(() =>
      expect(result.current).toBe('https://example.com/later.png'),
    )

    act(() => queryClient.setQueryData(recordsKey, { texts: [] }))
    await waitFor(() => expect(result.current).toBeUndefined())
  })

  it('reconciles row avatar reads without clearing the independently saved header', async () => {
    const name = 'beagle.eth'
    const recordsKey = qk('profile', 'get_records', {
      name,
      selection: 'name-row',
    })
    queryClient.setQueryData(recordsKey, {
      texts: [{ key: 'avatar', value: 'https://example.com/saved.png' }],
    })
    cacheSavedProfileImages({
      name,
      images: {
        avatar: 'https://example.com/saved.png',
        header: 'https://example.com/header.png',
      },
      queryClient,
    })
    const { result } = renderHook(
      () => ({
        avatar: useNameImageUrl({ name, kind: 'avatar' }),
        header: useNameImageUrl({ name, kind: 'header' }),
      }),
      { wrapper },
    )
    await waitFor(() =>
      expect(result.current.header).toBe('https://example.com/header.png'),
    )
    act(() => queryClient.setQueryData(recordsKey, { texts: [] }))
    await waitFor(() =>
      expect(result.current).toEqual({
        avatar: undefined,
        header: 'https://example.com/header.png',
      }),
    )
  })

  it('ignores a pre-save row lookup which finishes after a full profile read acknowledges the save', async () => {
    const name = 'beagle.eth'
    const rowKey = qk('profile', 'get_records', { name, selection: 'name-row' })
    let finishOldLookup:
      | ((data: { texts: { key: string; value: string }[] }) => void)
      | undefined
    const oldLookup = queryClient.fetchQuery({
      queryKey: rowKey,
      queryFn: () =>
        new Promise<{ texts: { key: string; value: string }[] }>((resolve) => {
          finishOldLookup = resolve
        }),
    })
    cacheSavedProfileImages({
      name,
      images: { avatar: 'https://example.com/saved.png' },
      queryClient,
    })
    const { result } = renderHook(
      () => useNameImageUrl({ name, kind: 'avatar' }),
      { wrapper },
    )
    await waitFor(() =>
      expect(result.current).toBe('https://example.com/saved.png'),
    )

    await act(async () => {
      queryClient.setQueryData(qk('profile', 'get_records', { name }), {
        texts: [{ key: 'avatar', value: 'https://example.com/saved.png' }],
      })
      finishOldLookup?.({
        texts: [{ key: 'avatar', value: 'https://example.com/old.png' }],
      })
      await oldLookup
    })
    expect(
      queryClient.getQueryData(savedProfileImagesQuery(name).queryKey)?.avatar
        ?.record,
    ).toBe('https://example.com/saved.png')
    expect(result.current).toBe('https://example.com/saved.png')

    await act(async () => {
      await queryClient.fetchQuery({
        queryKey: rowKey,
        queryFn: async () => ({
          texts: [{ key: 'avatar', value: 'https://example.com/later.png' }],
        }),
      })
    })
    await waitFor(() =>
      expect(result.current).toBe('https://example.com/later.png'),
    )
  })
})
