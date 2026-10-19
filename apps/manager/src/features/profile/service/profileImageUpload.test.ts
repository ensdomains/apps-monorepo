import type { SignTypedDataMutateAsync } from '@wagmi/core/query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_UPLOAD_BASE_URL } from '@/features/profile/constants'
import {
  prepareProfileImageUpload,
  submitPreparedProfileImageUpload,
} from './profileImageUpload'

describe('profile image upload helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    {
      type: 'avatar',
      imageUrl:
        'https://avatar-upload-staging.ens-cf.workers.dev/sepolia/vitalik.eth',
    },
    {
      type: 'header',
      imageUrl:
        'https://avatar-upload-staging.ens-cf.workers.dev/sepolia/vitalik.eth/h',
    },
  ] as const)(
    'prepares a $type upload draft without signing or sending it',
    async ({ type, imageUrl }) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const file = new File([new Uint8Array([1, 2, 3])], 'avatar.jpg', {
        type: 'image/jpeg',
      })

      const upload = await prepareProfileImageUpload({
        type,
        name: 'vitalik.eth',
        file,
      })

      expect(upload).toMatchObject({
        kind: type,
        imageUrl,
        name: 'vitalik.eth',
      })
      expect(upload.dataURL).toMatch(/^data:image\/jpeg;base64,/)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('submits a prepared upload with a typed-data signature', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'uploaded' }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const signTypedDataAsync = vi
      .fn()
      .mockResolvedValue(
        '0xsignature',
      ) as unknown as SignTypedDataMutateAsync<unknown>

    await expect(
      submitPreparedProfileImageUpload({
        address: '0x123',
        signTypedDataAsync,
        upload: {
          dataURL: 'data:image/jpeg;base64,AQID',
          hash: 'upload-hash',
          imageUrl: `${AVATAR_UPLOAD_BASE_URL}vitalik.eth`,
          kind: 'avatar',
          name: 'vitalik.eth',
        },
      }),
    ).resolves.toBeUndefined()

    expect(signTypedDataAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          hash: 'upload-hash',
          name: 'vitalik.eth',
          upload: 'avatar',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      `${AVATAR_UPLOAD_BASE_URL}vitalik.eth`,
      expect.objectContaining({
        method: 'PUT',
      }),
    )
  })
})
