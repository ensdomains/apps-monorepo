import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_UPLOAD_BASE_URL } from '@/features/profile/constants'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import {
  getActiveSignedProfileImageUploads,
  refreshProfileImageCaches,
} from './profileImageCache'
import { imageRecordQuery } from './profileImageRecord'

describe('profile image cache helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
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
      name,
      queryClient,
    })

    expect(queryClient.getQueryData(imageRecordQuery(imageUrl).queryKey)).toBe(
      cacheBustedImageUrl,
    )
  })

  it('stores cache-busting versions for name metadata image URLs after signed upload save', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)

    const queryClient = new QueryClient()
    const name = 'vitalik.eth'

    await refreshProfileImageCaches({
      images: [
        { kind: 'avatar', imageUrl: `${AVATAR_UPLOAD_BASE_URL}/${name}` },
        { kind: 'header', imageUrl: `${AVATAR_UPLOAD_BASE_URL}/${name}/h` },
      ],
      name,
      queryClient,
    })

    expect(
      queryClient.getQueryData(
        qk('profile', 'image_version', { kind: 'avatar', name }),
      ),
    ).toBe(1234)
    expect(
      queryClient.getQueryData(
        qk('profile', 'image_version', { kind: 'header', name }),
      ),
    ).toBe(1234)
  })
})
