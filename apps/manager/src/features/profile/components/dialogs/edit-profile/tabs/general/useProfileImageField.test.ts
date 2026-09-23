import { act, renderHook } from '@testing-library/react'
import type { ChangeEvent, DragEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileImageKind } from './ProfileImageField.types'
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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each<{
    kind: ProfileImageKind
    source: 'picker' | 'drop'
  }>([
    { kind: 'avatar', source: 'picker' },
    { kind: 'header', source: 'picker' },
    { kind: 'avatar', source: 'drop' },
    { kind: 'header', source: 'drop' },
  ])('rejects SVGs from the $source for the $kind before cropping', ({
    kind,
    source,
  }) => {
    const onActivate = vi.fn()
    const onImageChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ isActive }) =>
        useProfileImageField({
          isActive,
          kind,
          name: 'test.eth',
          onActivate,
          onCancel: vi.fn(),
          onImageChange,
          onImageRemove: vi.fn(),
        }),
      { initialProps: { isActive: source === 'picker' } },
    )
    const file = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"/>'],
      'image.svg',
      {
        type: 'image/svg+xml',
      },
    )

    act(() => {
      if (source === 'drop') {
        result.current.handleDrop({
          dataTransfer: { files: [file] },
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        } as unknown as DragEvent)
      } else {
        result.current.handleFileChange({
          target: { files: [file], value: 'image.svg' },
        } as unknown as ChangeEvent<HTMLInputElement>)
      }
    })
    // Activating a previously collapsed drop zone must keep the error visible.
    expect(onActivate).toHaveBeenCalledOnce()
    rerender({ isActive: true })

    expect(result.current.state.context.error).toBe(
      'SVG uploads are not supported. Use "Enter manually" with an SVG image URL.',
    )
    expect(result.current.state.matches('main')).toBe(true)
    expect(result.current.uploadFile).toBeNull()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(mocks.cropImageFile).not.toHaveBeenCalled()
    expect(mocks.prepareProfileImageUpload).not.toHaveBeenCalled()
    expect(onImageChange).not.toHaveBeenCalled()

    act(() => result.current.handleManualClick())
    expect(result.current.state.matches({ manualInput: 'entering' })).toBe(true)
    expect(result.current.state.context.error).toBeNull()

    act(() => {
      result.current.send({
        type: 'UPDATE_MANUAL_URL',
        url: 'https://example.com/image.svg',
      })
      result.current.send({ type: 'PREVIEW_MANUAL_URL' })
      result.current.send({ type: 'CONFIRM_MANUAL_URL' })
    })
    expect(onImageChange).toHaveBeenCalledWith('https://example.com/image.svg')
    expect(mocks.prepareProfileImageUpload).not.toHaveBeenCalled()
  })

  it('clears the SVG error when a supported raster image is selected', () => {
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
    const svg = new File(['svg'], 'image.svg', { type: 'image/svg+xml' })
    const png = new File(['png'], 'image.png', { type: 'image/png' })

    act(() => {
      result.current.handleFileChange({
        target: { files: [svg], value: 'image.svg' },
      } as unknown as ChangeEvent<HTMLInputElement>)
    })
    expect(result.current.state.context.error).not.toBeNull()

    act(() => {
      result.current.handleFileChange({
        target: { files: [png], value: 'image.png' },
      } as unknown as ChangeEvent<HTMLInputElement>)
    })
    expect(result.current.state.context.error).toBeNull()
    expect(result.current.state.matches('uploadPreview')).toBe(true)
    expect(result.current.uploadFile).toBe(png)
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
