import { describe, expect, it } from 'vitest'
import { encodeJpegWithinLimit } from './recordImageCanvas'
import { MAX_CROPPED_IMAGE_BYTES } from './recordImageCrop'

/** A canvas whose JPEG size depends on the quality it is asked for. */
const makeCanvas = (sizeAt: (quality: number) => number) => {
  const qualities: number[] = []
  return {
    qualities,
    canvas: {
      toBlob: (callback: BlobCallback, _type?: string, quality = 1) => {
        qualities.push(quality)
        callback(new Blob([new Uint8Array(sizeAt(quality))]))
      },
    },
  }
}

describe('encodeJpegWithinLimit', () => {
  it('lowers the quality until the JPEG fits the upload limit', async () => {
    const { canvas, qualities } = makeCanvas((quality) =>
      quality > 0.8 ? MAX_CROPPED_IMAGE_BYTES + 1 : MAX_CROPPED_IMAGE_BYTES,
    )

    const result = await encodeJpegWithinLimit(canvas, [0.9, 0.85, 0.75, 0.6])

    expect(result._unsafeUnwrap().size).toBe(MAX_CROPPED_IMAGE_BYTES)
    expect(qualities).toEqual([0.9, 0.85, 0.75])
  })

  it('fails with the size limit when no quality fits', async () => {
    const { canvas } = makeCanvas(() => MAX_CROPPED_IMAGE_BYTES + 1)

    const result = await encodeJpegWithinLimit(canvas, [0.9, 0.6])

    expect(result._unsafeUnwrapErr()).toMatchObject({
      _tag: 'RecordImageTooLargeError',
      maxBytes: MAX_CROPPED_IMAGE_BYTES,
    })
  })
})
