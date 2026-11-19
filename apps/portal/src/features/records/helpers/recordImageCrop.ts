import type { ImageTextRecordKey } from '@ens-apps/record-catalog/text'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { match } from 'ts-pattern'

export type RecordImageKind = ImageTextRecordKey

export interface ImageSize {
  readonly height: number
  readonly width: number
}

export interface CropOffset {
  readonly x: number
  readonly y: number
}

export interface CropRect {
  readonly height: number
  readonly width: number
  readonly x: number
  readonly y: number
}

export class RecordImageCropError extends TaggedError('RecordImageCropError')<{
  cause: unknown
}> {}

export class RecordImageConfirmError extends TaggedError(
  'RecordImageConfirmError',
)<{
  cause: unknown
}> {}

export class RecordImageTooLargeError extends TaggedError(
  'RecordImageTooLargeError',
)<{
  maxBytes: number
}> {}

export const MIN_CROP_ZOOM = 1
export const MAX_CROP_ZOOM = 3
export const MAX_IMAGE_FILE_SIZE_MB = 3

const MAX_IMAGE_FILE_SIZE_BYTES = MAX_IMAGE_FILE_SIZE_MB * 1024 * 1024
// The avatar worker rejects avatar and header uploads above 512 KiB.
export const MAX_CROPPED_IMAGE_BYTES = 512 * 1024
// JPEG qualities tried in order until the crop fits MAX_CROPPED_IMAGE_BYTES.
export const CROP_JPEG_QUALITIES: readonly number[] = [
  0.92, 0.85, 0.78, 0.7, 0.6,
]
const CROP_OUTPUT_SCALE = 4

// Logical crop sizes match the ENS App profile editor so both apps upload the
// same shapes; the dialog scales the viewport down to fit narrow screens.
const CROP_VIEWPORT_SIZES = {
  avatar: { height: 168, width: 168 },
  header: { height: 126, width: 340 },
} as const satisfies Record<RecordImageKind, ImageSize>

const CROP_ASPECT_LABELS = {
  avatar: '1:1 square',
  header: '2.7:1 banner',
} as const satisfies Record<RecordImageKind, string>

const UPLOAD_IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]

export const IMAGE_UPLOAD_ACCEPT = UPLOAD_IMAGE_TYPES.join(',')

export const getCropViewportSize = (kind: RecordImageKind): ImageSize =>
  CROP_VIEWPORT_SIZES[kind]

export const getCropAspectLabel = (kind: RecordImageKind): string =>
  CROP_ASPECT_LABELS[kind]

export const getCropOutputSize = (kind: RecordImageKind): ImageSize => ({
  height: CROP_VIEWPORT_SIZES[kind].height * CROP_OUTPUT_SCALE,
  width: CROP_VIEWPORT_SIZES[kind].width * CROP_OUTPUT_SCALE,
})

export const getImageFileError = (
  file: Pick<File, 'name' | 'size' | 'type'>,
): string | null => {
  // The upload service stores JPEGs only, so a vector image would be
  // flattened; SVGs belong in the record as a hosted URL instead.
  if (file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name)) {
    return 'SVG uploads aren’t supported. Enter the SVG’s URL as the record value instead.'
  }
  if (!UPLOAD_IMAGE_TYPES.includes(file.type)) {
    return 'Choose a JPG, PNG, GIF, WebP, AVIF, BMP or ICO image.'
  }
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    return `Choose an image under ${MAX_IMAGE_FILE_SIZE_MB}MB.`
  }
  return null
}

const getCropBaseScale = (imageSize: ImageSize, viewportSize: ImageSize) =>
  Math.max(
    viewportSize.width / imageSize.width,
    viewportSize.height / imageSize.height,
  )

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** Size of the image inside the crop viewport, in logical viewport pixels. */
const getRenderedImageSize = ({
  imageSize,
  kind,
  zoom,
}: {
  readonly imageSize: ImageSize
  readonly kind: RecordImageKind
  readonly zoom: number
}): ImageSize => {
  const scale = getCropBaseScale(imageSize, getCropViewportSize(kind)) * zoom
  return {
    height: imageSize.height * scale,
    width: imageSize.width * scale,
  }
}

/**
 * Image box inside the crop viewport as percentages of the viewport, so the
 * viewport can shrink on narrow screens without changing the crop.
 */
export const getCropImageBox = ({
  imageSize,
  kind,
  offset,
  zoom,
}: {
  readonly imageSize: ImageSize
  readonly kind: RecordImageKind
  readonly offset: CropOffset
  readonly zoom: number
}): CropRect => {
  const viewportSize = getCropViewportSize(kind)
  const rendered = getRenderedImageSize({ imageSize, kind, zoom })
  return {
    height: (rendered.height / viewportSize.height) * 100,
    width: (rendered.width / viewportSize.width) * 100,
    x: 50 + (offset.x / viewportSize.width) * 100,
    y: 50 + (offset.y / viewportSize.height) * 100,
  }
}

/** Keeps the image covering the whole viewport so the crop never shows a gap. */
export const getConstrainedCropOffset = ({
  imageSize,
  kind,
  offset,
  zoom,
}: {
  readonly imageSize: ImageSize
  readonly kind: RecordImageKind
  readonly offset: CropOffset
  readonly zoom: number
}): CropOffset => {
  const viewportSize = getCropViewportSize(kind)
  const rendered = getRenderedImageSize({ imageSize, kind, zoom })
  const maxX = Math.max(0, (rendered.width - viewportSize.width) / 2)
  const maxY = Math.max(0, (rendered.height - viewportSize.height) / 2)
  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  }
}

/** The part of the source image, in image pixels, that the viewport shows. */
export const getCropSourceRect = ({
  imageSize,
  kind,
  offset,
  zoom,
}: {
  readonly imageSize: ImageSize
  readonly kind: RecordImageKind
  readonly offset: CropOffset
  readonly zoom: number
}): CropRect => {
  const viewportSize = getCropViewportSize(kind)
  const scale = getCropBaseScale(imageSize, viewportSize) * zoom
  const width = viewportSize.width / scale
  const height = viewportSize.height / scale
  return {
    height,
    width,
    x: clamp(
      (imageSize.width - width) / 2 - offset.x / scale,
      0,
      Math.max(0, imageSize.width - width),
    ),
    y: clamp(
      (imageSize.height - height) / 2 - offset.y / scale,
      0,
      Math.max(0, imageSize.height - height),
    ),
  }
}

const getCauseMessage = (cause: unknown): string | null => {
  if (!(cause instanceof Error)) return null
  // viem errors carry a one-line summary next to a multi-line message.
  if ('shortMessage' in cause && typeof cause.shortMessage === 'string') {
    return cause.shortMessage
  }
  return cause.message || null
}

export type RecordImageError =
  | RecordImageCropError
  | RecordImageTooLargeError
  | RecordImageConfirmError

export const getRecordImageErrorMessage = (error: RecordImageError): string =>
  match(error)
    .with(
      { _tag: 'RecordImageCropError' },
      () => 'We couldn’t process this image. Try a different file.',
    )
    .with(
      { _tag: 'RecordImageTooLargeError' },
      ({ maxBytes }) =>
        `This crop is still over ${maxBytes / 1024} KB at reduced quality. Try a less detailed image.`,
    )
    .with(
      { _tag: 'RecordImageConfirmError' },
      ({ cause }) =>
        getCauseMessage(cause) ?? 'Something went wrong. Please try again.',
    )
    .exhaustive()
