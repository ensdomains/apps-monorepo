import { act, renderHook } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProfileImageField } from './useProfileImageField'

const mocks = vi.hoisted(() => ({
  cropImageFile: vi.fn(),
  prepareProfileImageUpload: vi.fn(),
  setQueryData: vi.fn(),
}))

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined }),
  useChainId: () => 1,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: undefined,
    error: null,
    isFetching: false,
  }),
  useQueryClient: () => ({
    setQueryData: mocks.setQueryData,
  }),
}))

vi.mock('@/features/profile/service/profileImageRecord', () => ({
  imageRecordQuery: () => ({ queryKey: ['profile', 'image_record'] }),
}))

vi.mock('@/features/profile/service/profileNfts', () => ({
  profileNftsQuery: () => ({ queryKey: ['profile', 'nfts'] }),
}))

vi.mock('./ProfileImageField.crop', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./ProfileImageField.crop')>()
  return {
    ...actual,
    cropImageFile: mocks.cropImageFile,
  }
})

vi.mock('@/features/profile/service/profileImageUpload', () => ({
  prepareProfileImageUpload: mocks.prepareProfileImageUpload,
}))

describe('useProfileImageField', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })

  it('prepares the cropped file for upload instead of the original file', async () => {
    const originalFile = new File(['original-bytes'], 'avatar.jpg', {
      type: 'image/jpeg',
    })
    const croppedFile = new File(['cropped-bytes'], 'avatar-cropped.jpg', {
      type: 'image/jpeg',
    })
    mocks.cropImageFile.mockResolvedValue(croppedFile)
    mocks.prepareProfileImageUpload.mockResolvedValue({
      dataURL: 'data:image/jpeg;base64,cropped',
      hash: 'hash',
      imageUrl: 'https://example.com/avatar',
      kind: 'avatar',
      name: 'test.eth',
    })

    const { result } = renderHook(() =>
      useProfileImageField({
        isActive: true,
        kind: 'avatar',
        name: 'test.eth',
        onActivate: vi.fn(),
        onCancel: vi.fn(),
        onImageChange: vi.fn(),
        onImageRemove: vi.fn(),
      }),
    )

    act(() => {
      result.current.handleFileChange({
        target: {
          files: [originalFile],
          value: 'C:\\fakepath\\avatar.jpg',
        },
      } as unknown as ChangeEvent<HTMLInputElement>)
    })
    act(() => {
      result.current.handleCropImageLoad({ width: 400, height: 400 })
    })
    await act(async () => {
      await result.current.handleConfirmCrop()
    })

    expect(mocks.prepareProfileImageUpload).toHaveBeenCalledWith(
      expect.objectContaining({ file: croppedFile }),
    )
    expect(mocks.prepareProfileImageUpload).not.toHaveBeenCalledWith(
      expect.objectContaining({ file: originalFile }),
    )
  })
})
