import { createHash } from 'node:crypto'

export class InvalidPngError extends Error {
  override readonly name = 'InvalidPngError'
}

const PNG_SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

const PNG_BIT_DEPTHS = new Map<number, readonly number[]>([
  [0, [1, 2, 4, 8, 16]],
  [2, [8, 16]],
  [3, [1, 2, 4, 8]],
  [4, [8, 16]],
  [6, [8, 16]],
])
const EXPECTED_PNG_HEIGHT = 1434
const EXPECTED_PNG_WIDTH = 1024

type PngChunk = {
  readonly dataLength: number
  readonly dataOffset: number
  readonly end: number
  readonly type: string
}

const readUint32 = (bytes: Uint8Array, offset: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
  )

const readAscii = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length))

const readPngChunk = (
  bytes: Uint8Array,
  offset: number,
): PngChunk | undefined => {
  if (offset + 12 > bytes.byteLength) return undefined

  const dataLength = readUint32(bytes, offset)
  const end = offset + 12 + dataLength
  if (end > bytes.byteLength) return undefined

  return {
    dataLength,
    dataOffset: offset + 8,
    end,
    type: readAscii(bytes, offset + 4, 4),
  }
}

const hasPngSignature = (bytes: Uint8Array): boolean =>
  bytes.byteLength >= PNG_SIGNATURE.byteLength + 12 &&
  PNG_SIGNATURE.every((value, index) => bytes[index] === value)

const hasValidHeader = (bytes: Uint8Array, chunk: PngChunk): boolean => {
  if (chunk.type !== 'IHDR' || chunk.dataLength !== 13) return false

  const width = readUint32(bytes, chunk.dataOffset)
  const height = readUint32(bytes, chunk.dataOffset + 4)
  const bitDepth = bytes[chunk.dataOffset + 8]
  const colorType = bytes[chunk.dataOffset + 9]
  const compressionMethod = bytes[chunk.dataOffset + 10]
  const filterMethod = bytes[chunk.dataOffset + 11]
  const interlaceMethod = bytes[chunk.dataOffset + 12]

  return (
    width === EXPECTED_PNG_WIDTH &&
    height === EXPECTED_PNG_HEIGHT &&
    Boolean(PNG_BIT_DEPTHS.get(colorType)?.includes(bitDepth)) &&
    compressionMethod === 0 &&
    filterMethod === 0 &&
    (interlaceMethod === 0 || interlaceMethod === 1)
  )
}

const hasValidChunkOrder = (
  bytes: Uint8Array,
  chunk: PngChunk,
  hasHeader: boolean,
): boolean => (hasHeader ? chunk.type !== 'IHDR' : hasValidHeader(bytes, chunk))

const isCompletePngEnd = (
  bytes: Uint8Array,
  chunk: PngChunk,
  hasImageData: boolean,
): boolean =>
  chunk.dataLength === 0 && hasImageData && chunk.end === bytes.byteLength

export const isValidPng = (bytes: Uint8Array): boolean => {
  if (!hasPngSignature(bytes)) return false

  let offset = PNG_SIGNATURE.byteLength
  let hasHeader = false
  let hasImageData = false

  while (offset < bytes.byteLength) {
    const chunk = readPngChunk(bytes, offset)
    if (!chunk) return false
    if (!hasValidChunkOrder(bytes, chunk, hasHeader)) return false
    hasHeader = true

    if (chunk.type === 'IDAT' && chunk.dataLength > 0) hasImageData = true
    if (chunk.type === 'IEND') {
      return isCompletePngEnd(bytes, chunk, hasImageData)
    }

    offset = chunk.end
  }

  return false
}

export const validatePng = (bytes: Uint8Array): void => {
  if (!isValidPng(bytes)) {
    throw new InvalidPngError(
      `Renderer output is not a complete ${EXPECTED_PNG_WIDTH}x${EXPECTED_PNG_HEIGHT} PNG`,
    )
  }
}

export const sha256Hex = (value: Uint8Array | ArrayBuffer | string): string => {
  const hash = createHash('sha256')
  if (typeof value === 'string') {
    hash.update(value)
  } else {
    hash.update(value instanceof Uint8Array ? value : new Uint8Array(value))
  }
  return hash.digest('hex')
}
