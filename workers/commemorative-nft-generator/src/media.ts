import { createHash } from 'node:crypto'
import { UnsupportedRendererOutputError } from './errors.js'

const PNG_SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

const ISO_CONTAINER_BOXES = new Set(['mdia', 'minf', 'moov', 'stbl', 'trak'])
const PNG_BIT_DEPTHS = new Map<number, readonly number[]>([
  [0, [1, 2, 4, 8, 16]],
  [2, [8, 16]],
  [3, [1, 2, 4, 8]],
  [4, [8, 16]],
  [6, [8, 16]],
])

const readUint32 = (bytes: Uint8Array, offset: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
  )

const readAscii = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length))

type PngChunk = {
  readonly dataLength: number
  readonly dataOffset: number
  readonly end: number
  readonly type: string
}

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

const isValidPngHeader = (bytes: Uint8Array, chunk: PngChunk): boolean => {
  if (chunk.type !== 'IHDR' || chunk.dataLength !== 13) return false
  const width = readUint32(bytes, chunk.dataOffset)
  const height = readUint32(bytes, chunk.dataOffset + 4)
  const bitDepth = bytes[chunk.dataOffset + 8]
  const colorType = bytes[chunk.dataOffset + 9]
  return (
    width > 0 &&
    height > 0 &&
    Boolean(PNG_BIT_DEPTHS.get(colorType)?.includes(bitDepth)) &&
    bytes[chunk.dataOffset + 10] === 0 &&
    bytes[chunk.dataOffset + 11] === 0 &&
    [0, 1].includes(bytes[chunk.dataOffset + 12])
  )
}

const hasValidPngSignature = (bytes: Uint8Array): boolean =>
  bytes.byteLength >= PNG_SIGNATURE.byteLength + 12 &&
  PNG_SIGNATURE.every((value, index) => bytes[index] === value)

const isValidPngChunkOrder = (
  bytes: Uint8Array,
  chunk: PngChunk,
  hasHeader: boolean,
): boolean =>
  hasHeader ? chunk.type !== 'IHDR' : isValidPngHeader(bytes, chunk)

const isCompletePngEnd = (
  bytes: Uint8Array,
  chunk: PngChunk,
  hasImageData: boolean,
): boolean =>
  chunk.dataLength === 0 && hasImageData && chunk.end === bytes.byteLength

const isStructurallyValidPng = (bytes: Uint8Array): boolean => {
  if (!hasValidPngSignature(bytes)) return false

  let offset = PNG_SIGNATURE.byteLength
  let hasHeader = false
  let hasImageData = false

  while (offset < bytes.byteLength) {
    const chunk = readPngChunk(bytes, offset)
    if (!chunk) return false
    if (!isValidPngChunkOrder(bytes, chunk, hasHeader)) return false
    hasHeader = true

    if (chunk.type === 'IDAT' && chunk.dataLength > 0) hasImageData = true
    if (chunk.type === 'IEND') {
      return isCompletePngEnd(bytes, chunk, hasImageData)
    }
    offset = chunk.end
  }

  return false
}

type IsoBox = {
  readonly end: number
  readonly payloadStart: number
  readonly type: string
}

const readIsoBox = (
  bytes: Uint8Array,
  offset: number,
  parentEnd: number,
): IsoBox => {
  if (offset + 8 > parentEnd) throw new Error('Incomplete ISO box header')

  const size32 = readUint32(bytes, offset)
  const type = readAscii(bytes, offset + 4, 4)
  let headerSize = 8
  let size = size32
  if (size32 === 1) {
    if (offset + 16 > parentEnd) throw new Error('Incomplete ISO large box')
    const largeSize = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getBigUint64(offset + 8)
    if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('ISO box is too large')
    }
    headerSize = 16
    size = Number(largeSize)
  } else if (size32 === 0) {
    size = parentEnd - offset
  }

  if (size < headerSize || offset + size > parentEnd) {
    throw new Error('Invalid ISO box size')
  }

  return {
    end: offset + size,
    payloadStart: offset + headerSize,
    type,
  }
}

const readIsoBoxes = (
  bytes: Uint8Array,
  start: number,
  end: number,
): readonly IsoBox[] => {
  const boxes: IsoBox[] = []
  let offset = start
  while (offset < end) {
    const box = readIsoBox(bytes, offset, end)
    boxes.push(box)
    offset = box.end
  }
  return boxes
}

const hasAvcConfiguration = (
  bytes: Uint8Array,
  sampleEntry: IsoBox,
): boolean => {
  const visualSampleEntryLength = 78
  const childrenStart = sampleEntry.payloadStart + visualSampleEntryLength
  if (childrenStart > sampleEntry.end) return false

  return readIsoBoxes(bytes, childrenStart, sampleEntry.end).some(
    (box) =>
      box.type === 'avcC' &&
      box.end - box.payloadStart >= 7 &&
      bytes[box.payloadStart] === 1,
  )
}

const stsdHasH264SampleEntry = (bytes: Uint8Array, stsd: IsoBox): boolean => {
  if (stsd.payloadStart + 8 > stsd.end) return false
  const entryCount = readUint32(bytes, stsd.payloadStart + 4)
  let offset = stsd.payloadStart + 8

  for (let index = 0; index < entryCount; index += 1) {
    const entry = readIsoBox(bytes, offset, stsd.end)
    if (
      (entry.type === 'avc1' || entry.type === 'avc3') &&
      hasAvcConfiguration(bytes, entry)
    ) {
      return true
    }
    offset = entry.end
  }

  return false
}

const containerHasH264SampleEntry = (
  bytes: Uint8Array,
  start: number,
  end: number,
): boolean =>
  readIsoBoxes(bytes, start, end).some((box) => {
    if (box.type === 'stsd') return stsdHasH264SampleEntry(bytes, box)
    if (!ISO_CONTAINER_BOXES.has(box.type)) return false
    return containerHasH264SampleEntry(bytes, box.payloadStart, box.end)
  })

const isStructurallyValidH264Mp4 = (bytes: Uint8Array): boolean => {
  try {
    const boxes = readIsoBoxes(bytes, 0, bytes.byteLength)
    const ftyp = boxes.find(({ type }) => type === 'ftyp')
    const moov = boxes.find(({ type }) => type === 'moov')
    const mdat = boxes.find(({ type }) => type === 'mdat')
    return Boolean(
      ftyp &&
        ftyp.end - ftyp.payloadStart >= 8 &&
        moov &&
        mdat &&
        mdat.end > mdat.payloadStart &&
        containerHasH264SampleEntry(bytes, moov.payloadStart, moov.end),
    )
  } catch {
    return false
  }
}

export const sha256Hex = (value: Uint8Array | ArrayBuffer | string): string => {
  const hash = createHash('sha256')
  hash.update(
    typeof value === 'string'
      ? value
      : value instanceof Uint8Array
        ? value
        : new Uint8Array(value),
  )
  return hash.digest('hex')
}

export const validatePng = (bytes: Uint8Array): void => {
  if (!isStructurallyValidPng(bytes)) {
    throw new UnsupportedRendererOutputError(
      'Renderer output is not a valid non-empty PNG',
    )
  }
}

export const validateH264Mp4 = (bytes: Uint8Array): void => {
  if (!isStructurallyValidH264Mp4(bytes)) {
    throw new UnsupportedRendererOutputError(
      'Renderer output is not a valid H.264 MP4',
    )
  }
}
