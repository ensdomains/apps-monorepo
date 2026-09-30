import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_UPLOAD_BASE_URL } from '@/features/profile/constants'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import {
  getActiveSignedProfileImageUploads,
  refreshProfileImageCaches,
} from './profileImageCache'
import { imageRecordQuery } from './profileImageRecord'
import { profileImageVersionQuery } from './profileImageVersion'

describe('profile image cache helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns only signed uploads still used by the submitted profile records', () => {
    const avatarUrl = `${AVATAR_UPLOAD_BASE_URL}/vitalik.eth`
    const headerUrl = `${AVATAR_UPLOAD_BASE_URL}/vitalik.eth/h`
    const records = {
      ...newEmptyProfileRecords(),
      base: {
        avatar: avatarUrl,
        header: 'https://example.com/header.png',
      },
    }

    expect(
      getActiveSignedProfileImageUploads({
        images: [
          { kind: 'avatar', imageUrl: avatarUrl },
          { kind: 'header', imageUrl: headerUrl },
        ],
        records,
      }),
    ).toEqual([{ kind: 'avatar', imageUrl: avatarUrl }])
  })

  it('cache busts raw image records after signed upload save', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)

    const queryClient = new QueryClient()
    const name = 'vitalik.eth'
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}/${name}`
    const cacheBustedImageUrl = `${imageUrl}?v=1234`

    queryClient.setQueryData(imageRecordQuery(imageUrl).queryKey, imageUrl)

    await refreshProfileImageCaches({
      images: [{ kind: 'avatar', imageUrl }],
      queryClient,
    })

    expect(queryClient.getQueryData(imageRecordQuery(imageUrl).queryKey)).toBe(
      cacheBustedImageUrl,
    )
  })

  it('refreshes both images and retains their versions when records refetch', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const queryClient = new QueryClient()
    const avatarUrl = `${AVATAR_UPLOAD_BASE_URL}/sepolia/test.eth`
    const headerUrl = `${avatarUrl}/h`
    const gatewayQuery = imageRecordQuery(avatarUrl, {
      ipfs: 'https://example.com/ipfs',
    })
    queryClient.setQueryData(gatewayQuery.queryKey, avatarUrl)

    await refreshProfileImageCaches({
      images: [
        { kind: 'avatar', imageUrl: avatarUrl },
        { kind: 'header', imageUrl: headerUrl },
      ],
      queryClient,
    })

    expect(queryClient.getQueryData(gatewayQuery.queryKey)).toBe(
      `${avatarUrl}?v=1234`,
    )
    expect(await queryClient.fetchQuery(gatewayQuery)).toBe(
      `${avatarUrl}?v=1234`,
    )
    expect(await queryClient.fetchQuery(imageRecordQuery(headerUrl))).toBe(
      `${headerUrl}?v=1234`,
    )
  })

  it('retains a successful upload version after image queries are garbage collected', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1234)
    const queryClient = new QueryClient()
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}/test.eth`
    const options = imageRecordQuery(imageUrl)

    await refreshProfileImageCaches({
      images: [{ kind: 'avatar', imageUrl }],
      queryClient,
    })
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)

    expect(queryClient.getQueryData(options.queryKey)).toBeUndefined()
    expect(await queryClient.fetchQuery(options)).toBe(`${imageUrl}?v=1234`)
    queryClient.clear()
  })

  it('uses a new version for repeated uploads to the same URL', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const queryClient = new QueryClient()
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}/test.eth/h`
    const images = [{ kind: 'header' as const, imageUrl }]

    await refreshProfileImageCaches({ images, queryClient })
    await refreshProfileImageCaches({ images, queryClient })

    expect(await queryClient.fetchQuery(imageRecordQuery(imageUrl))).toBe(
      `${imageUrl}?v=1235`,
    )
  })

  it('does not change unrelated images or another QueryClient', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const queryClient = new QueryClient()
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}/test.eth`
    const otherImageUrl = `${AVATAR_UPLOAD_BASE_URL}/other.eth`
    const externalImageUrl = 'https://example.com/avatar.png'
    queryClient.setQueryData(
      imageRecordQuery(otherImageUrl).queryKey,
      otherImageUrl,
    )
    queryClient.setQueryData(
      imageRecordQuery(externalImageUrl).queryKey,
      externalImageUrl,
    )

    await refreshProfileImageCaches({
      images: [{ kind: 'avatar', imageUrl }],
      queryClient,
    })

    expect(
      queryClient.getQueryData(imageRecordQuery(otherImageUrl).queryKey),
    ).toBe(otherImageUrl)
    expect(
      queryClient.getQueryData(imageRecordQuery(externalImageUrl).queryKey),
    ).toBe(externalImageUrl)
    expect(await new QueryClient().fetchQuery(imageRecordQuery(imageUrl))).toBe(
      imageUrl,
    )
  })

  it('does not add upload versions to external URLs', async () => {
    const queryClient = new QueryClient()
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}.example.com/test.eth`

    await refreshProfileImageCaches({
      images: [{ kind: 'avatar', imageUrl }],
      queryClient,
    })

    expect(
      queryClient.getQueryData(profileImageVersionQuery(imageUrl).queryKey),
    ).toBeUndefined()
    expect(await queryClient.fetchQuery(imageRecordQuery(imageUrl))).toBe(
      imageUrl,
    )
  })

  it('prevents an in-flight image lookup from restoring the previous image', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const queryClient = new QueryClient()
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}/test.eth`
    const options = imageRecordQuery(imageUrl)
    let resolveLookup: ((url: string) => void) | undefined
    const pendingLookup = queryClient
      .fetchQuery({
        ...options,
        queryFn: () =>
          new Promise<string>((resolve) => {
            resolveLookup = resolve
          }),
      })
      .catch(() => undefined)

    await refreshProfileImageCaches({
      images: [{ kind: 'avatar', imageUrl }],
      queryClient,
    })
    resolveLookup?.(imageUrl)
    await pendingLookup

    expect(queryClient.getQueryData(options.queryKey)).toBe(
      `${imageUrl}?v=1234`,
    )
  })
})
