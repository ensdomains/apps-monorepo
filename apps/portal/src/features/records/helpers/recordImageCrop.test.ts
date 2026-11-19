import { describe, expect, it } from 'vitest'
import {
  getConstrainedCropOffset,
  getCropSourceRect,
  getImageFileError,
  getRecordImageErrorMessage,
  MAX_CROPPED_IMAGE_BYTES,
  RecordImageConfirmError,
  RecordImageTooLargeError,
} from './recordImageCrop'

const MB = 1024 * 1024

describe('getImageFileError', () => {
  it.each([
    [
      'an SVG by type',
      { name: 'a.png', type: 'image/svg+xml', size: 1 },
      /SVG/,
    ],
    ['an SVG by extension', { name: 'a.svgz', type: '', size: 1 }, /SVG/],
    [
      'an unsupported type',
      { name: 'a.pdf', type: 'application/pdf', size: 1 },
      /JPG, PNG/,
    ],
    [
      'a file over 3MB',
      { name: 'a.jpg', type: 'image/jpeg', size: 3 * MB + 1 },
      /under 3MB/,
    ],
  ])('rejects %s', (_, file, message) => {
    expect(getImageFileError(file)).toMatch(message)
  })

  it('accepts a supported image up to 3MB', () => {
    expect(
      getImageFileError({ name: 'a.webp', type: 'image/webp', size: 3 * MB }),
    ).toBeNull()
  })
})

describe('crop geometry', () => {
  // 800x200 in the 340x126 header viewport at 2x zoom: rendered 1008x252.
  const header = {
    imageSize: { width: 800, height: 200 },
    kind: 'header' as const,
    zoom: 2,
  }

  it('keeps the image covering the viewport', () => {
    expect(
      getConstrainedCropOffset({ ...header, offset: { x: 999, y: -999 } }),
    ).toEqual({ x: 334, y: -63 })
  })

  it('crops the part of the image the viewport shows', () => {
    // Dragged fully right, the viewport shows the image's left edge.
    const rect = getCropSourceRect({ ...header, offset: { x: 334, y: 0 } })

    expect(rect.x).toBeCloseTo(0)
    expect(rect.y).toBeCloseTo(50)
    expect(rect.width).toBeCloseTo(340 / 1.26)
    expect(rect.height).toBeCloseTo(100)
  })
})

describe('getRecordImageErrorMessage', () => {
  it('prefers the one-line summary of a wallet error', () => {
    const cause = Object.assign(new Error('Long\nmulti-line details'), {
      shortMessage: 'User rejected the request.',
    })
    expect(
      getRecordImageErrorMessage(new RecordImageConfirmError({ cause })),
    ).toBe('User rejected the request.')
  })

  it('names the size limit when the crop cannot fit', () => {
    expect(
      getRecordImageErrorMessage(
        new RecordImageTooLargeError({ maxBytes: MAX_CROPPED_IMAGE_BYTES }),
      ),
    ).toMatch('512 KB')
  })
})
