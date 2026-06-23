import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_UPLOAD_BASE_URL } from '@/features/profile/constants'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import {
  buildNameAvatarUrl,
  buildNameHeaderUrl,
  nameAvatarQuery,
  nameHeaderQuery,
  namesAvatarsByNameQuery,
} from './profileAvatar'
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

  it('cache busts gasless avatar queries after signed upload save', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)

    const queryClient = new QueryClient()
    const name = 'vitalik.eth'
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}/${name}`
    const cacheBustedImageUrl = `${imageUrl}?v=1234`
    const cacheBustedMetadataAvatarUrl = buildNameAvatarUrl(name, 1234)

    queryClient.setQueryData(imageRecordQuery(imageUrl).queryKey, imageUrl)
    queryClient.setQueryData(nameAvatarQuery(name).queryKey, imageUrl)
    queryClient.setQueryData(namesAvatarsByNameQuery([name]).queryKey, {
      [name]: imageUrl,
    })

    await refreshProfileImageCaches({
      images: [{ kind: 'avatar', imageUrl }],
      name,
      queryClient,
    })

    expect(queryClient.getQueryData(imageRecordQuery(imageUrl).queryKey)).toBe(
      cacheBustedImageUrl,
    )
    expect(queryClient.getQueryData(nameAvatarQuery(name).queryKey)).toBe(
      cacheBustedMetadataAvatarUrl,
    )
    expect(
      queryClient.getQueryData(namesAvatarsByNameQuery([name]).queryKey),
    ).toEqual({ [name]: cacheBustedMetadataAvatarUrl })
  })

  it('cache busts gasless header queries after signed upload save', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)

    const queryClient = new QueryClient()
    const name = 'vitalik.eth'
    const imageUrl = `${AVATAR_UPLOAD_BASE_URL}/${name}/h`
    const cacheBustedImageUrl = `${imageUrl}?v=1234`
    const cacheBustedMetadataHeaderUrl = buildNameHeaderUrl(name, 1234)

    queryClient.setQueryData(imageRecordQuery(imageUrl).queryKey, imageUrl)
    queryClient.setQueryData(nameHeaderQuery(name).queryKey, imageUrl)

    await refreshProfileImageCaches({
      images: [{ kind: 'header', imageUrl }],
      name,
      queryClient,
    })

    expect(queryClient.getQueryData(imageRecordQuery(imageUrl).queryKey)).toBe(
      cacheBustedImageUrl,
    )
    expect(queryClient.getQueryData(nameHeaderQuery(name).queryKey)).toBe(
      cacheBustedMetadataHeaderUrl,
    )
  })
})
