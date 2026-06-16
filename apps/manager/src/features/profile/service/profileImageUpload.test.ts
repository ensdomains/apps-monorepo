import { QueryClient } from '@tanstack/react-query'
import type { SignTypedDataMutateAsync } from '@wagmi/core/query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_UPLOAD_BASE_URL } from '@/features/profile/constants'
import { uploadImageMutationOptions } from './profileImageUpload'

describe('uploadImageMutationOptions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uploads the file passed to the mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'uploaded' }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const onImageChange = vi.fn()
    const onImageUploadComplete = vi.fn()
    const send = vi.fn()
    const setOpen = vi.fn()
    const setUploadFile = vi.fn()
    const signTypedDataAsync = vi
      .fn()
      .mockResolvedValue(
        '0xsignature',
      ) as unknown as SignTypedDataMutateAsync<unknown>
    const file = new File([new Uint8Array([1, 2, 3])], 'avatar.jpg', {
      type: 'image/jpeg',
    })

    const options = uploadImageMutationOptions({
      type: 'avatar',
      name: 'vitalik.eth',
      isConnected: true,
      address: '0x123',
      chainId: 1,
      signTypedDataAsync,
      onImageChange,
      onImageUploadComplete,
      setOpen,
      setUploadFile,
      send,
    })

    if (!options.mutationFn) {
      throw new Error('Expected upload mutation function')
    }

    await expect(
      options.mutationFn(file, {
        client: new QueryClient(),
        meta: undefined,
      }),
    ).resolves.toBeUndefined()

    const endpoint = `${AVATAR_UPLOAD_BASE_URL}/vitalik.eth`
    expect(fetchMock).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        method: 'PUT',
      }),
    )
    expect(onImageChange).toHaveBeenCalledWith(endpoint)
    expect(onImageUploadComplete).toHaveBeenCalledWith(endpoint)
    expect(setOpen).toHaveBeenCalledWith(false)
    expect(setUploadFile).toHaveBeenCalledWith(null)
    expect(send).toHaveBeenCalledWith({ type: 'RESET' })
  })
})
