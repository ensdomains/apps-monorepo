import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_UPLOAD_BASE_URL } from '@/features/profile/constants'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import {
  nameAvatarQuery,
  namesAvatarsByNameQuery,
  namesAvatarsQuery,
  parseAvatarQuery,
} from './profileAvatar'
import {
  getActiveSignedProfileImageUploads,
  refreshProfileImageCaches,
} from './profileImageCache'

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
    const resolverAddress = '0x0000000000000000000000000000000000000001'

    queryClient.setQueryData(parseAvatarQuery(imageUrl).queryKey, imageUrl)
    queryClient.setQueryData(nameAvatarQuery(name).queryKey, imageUrl)
    queryClient.setQueryData(namesAvatarsByNameQuery([name]).queryKey, {
      [name]: imageUrl,
    })
    queryClient.setQueryData(
      namesAvatarsQuery([{ name, resolverAddress }]).queryKey,
      {
        [name]: imageUrl,
      },
    )

    await refreshProfileImageCaches({
      images: [{ kind: 'avatar', imageUrl }],
      name,
      queryClient,
    })

    expect(queryClient.getQueryData(parseAvatarQuery(imageUrl).queryKey)).toBe(
      cacheBustedImageUrl,
    )
    expect(queryClient.getQueryData(nameAvatarQuery(name).queryKey)).toBe(
      cacheBustedImageUrl,
    )
    expect(
      queryClient.getQueryData(namesAvatarsByNameQuery([name]).queryKey),
    ).toEqual({ [name]: cacheBustedImageUrl })
    expect(
      queryClient.getQueryData(
        namesAvatarsQuery([{ name, resolverAddress }]).queryKey,
      ),
    ).toEqual({ [name]: cacheBustedImageUrl })
  })
})
