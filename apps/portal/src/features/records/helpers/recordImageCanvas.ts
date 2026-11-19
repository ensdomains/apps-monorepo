import { fromSync, ResultFn } from '@ens-apps/utils/neverthrow'
import {
  err,
  errAsync,
  ok,
  okAsync,
  type Result,
  ResultAsync,
} from 'neverthrow'
import {
  CROP_JPEG_QUALITIES,
  type CropOffset,
  getCropOutputSize,
  getCropSourceRect,
  type ImageSize,
  MAX_CROPPED_IMAGE_BYTES,
  RecordImageCropError,
  type RecordImageKind,
  RecordImageTooLargeError,
} from './recordImageCrop'

const getCroppedFileName = (fileName: string) =>
  `${fileName.replace(/\.[^/.]+$/, '') || 'image'}-cropped.jpg`

const drawCrop = ({
  bitmap,
  imageSize,
  kind,
  offset,
  zoom,
}: {
  readonly bitmap: ImageBitmap
  readonly imageSize: ImageSize
  readonly kind: RecordImageKind
  readonly offset: CropOffset
  readonly zoom: number
}): Result<HTMLCanvasElement, RecordImageCropError> => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    return err(
      new RecordImageCropError({ cause: 'Canvas 2D context unavailable' }),
    )
  }
  const output = getCropOutputSize(kind)
  const source = getCropSourceRect({ imageSize, kind, offset, zoom })
  canvas.width = output.width
  canvas.height = output.height
  // Fill first so transparent PNG/GIF areas become white rather than black in the JPEG.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, output.width, output.height)
  context.drawImage(
    bitmap,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    output.width,
    output.height,
  )
  return ok(canvas)
}

type JpegCanvas = Pick<HTMLCanvasElement, 'toBlob'>

const canvasToJpeg = (canvas: JpegCanvas, quality: number) =>
  ResultAsync.fromPromise(
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Empty canvas'))),
        'image/jpeg',
        quality,
      )
    }),
    (cause) => new RecordImageCropError({ cause }),
  )

/** Encodes at the first quality whose JPEG fits the hosting limit. */
export const encodeJpegWithinLimit = (
  canvas: JpegCanvas,
  qualities: readonly number[] = CROP_JPEG_QUALITIES,
): ResultAsync<Blob, RecordImageCropError | RecordImageTooLargeError> => {
  const [quality, ...lowerQualities] = qualities
  if (quality === undefined) {
    return errAsync(
      new RecordImageTooLargeError({ maxBytes: MAX_CROPPED_IMAGE_BYTES }),
    )
  }
  return canvasToJpeg(canvas, quality).andThen((blob) =>
    blob.size <= MAX_CROPPED_IMAGE_BYTES
      ? okAsync(blob)
      : encodeJpegWithinLimit(canvas, lowerQualities),
  )
}

/**
 * Crops the file to the viewport and re-encodes it as a JPEG within
 * MAX_CROPPED_IMAGE_BYTES. Re-encoding always happens, so source metadata such
 * as EXIF/GPS never reaches the upload.
 */
export const cropImageFile = ResultFn(async function* (input: {
  readonly file: File
  readonly imageSize: ImageSize
  readonly kind: RecordImageKind
  readonly offset: CropOffset
  readonly zoom: number
}) {
  const bitmap = yield* ResultAsync.fromPromise(
    createImageBitmap(input.file),
    (cause) => new RecordImageCropError({ cause }),
  )
  // drawImage can throw on an undecodable bitmap; keep that inside the Result.
  const canvas = fromSync(
    () => drawCrop({ ...input, bitmap }),
    (cause) => new RecordImageCropError({ cause }),
  ).andThen((drawn) => drawn)
  bitmap.close()
  const blob = yield* encodeJpegWithinLimit(yield* canvas)
  return ok(
    new File([blob], getCroppedFileName(input.file.name), {
      type: 'image/jpeg',
    }),
  )
})
