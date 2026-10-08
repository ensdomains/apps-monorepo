import { afterEach, describe, expect, it, vi } from 'vitest'
import { cropImageFile } from './ProfileImageField.crop'

describe('cropImageFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('re-encodes uploaded images so source metadata is not preserved', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: 400,
        height: 400,
        close: vi.fn(),
      })),
    )

    const reencodedBlob = new Blob(['REENCODED-JPEG'], { type: 'image/jpeg' })
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => {
        callback(reencodedBlob)
      },
    )

    const originalFile = new File(['EXIF-GPS-SENTINEL'], 'avatar.jpg', {
      type: 'image/jpeg',
    })
    const croppedFile = await cropImageFile({
      file: originalFile,
      imageSize: { width: 400, height: 400 },
      kind: 'avatar',
      offset: { x: 0, y: 0 },
      zoom: 1,
    })
    const croppedText = await croppedFile.text()

    expect(croppedFile).not.toBe(originalFile)
    expect(croppedFile.type).toBe('image/jpeg')
    expect(croppedText).toBe('REENCODED-JPEG')
    expect(croppedText).not.toContain('EXIF-GPS-SENTINEL')
  })
})
