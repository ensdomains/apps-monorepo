const CONTAINER_BOXES = new Set(['mdia', 'minf', 'moov', 'stbl', 'trak'])
const TIMESTAMP_BOXES = new Set(['mdhd', 'mvhd', 'tkhd'])

const CHROMIUM_SEI_PREFIX = Uint8Array.from([
  0x06, 0x05, 0x2d, 0x47, 0x56, 0x4a, 0xdc, 0x5c, 0x4c, 0x43, 0x3f, 0x94, 0xef,
  0xc5, 0x11, 0x3c, 0xd1, 0x43, 0xa8,
])

// Chromium's VideoEncoder inserts a wall-clock value into this otherwise
// unregistered SEI payload. Keeping one valid, fixed payload preserves the NAL
// length and playback while making identical renders byte-identical.
const CANONICAL_CHROMIUM_SEI_PAYLOAD = Uint8Array.from([
  0x01, 0x00, 0x00, 0x03, 0x00, 0x01, 0x03, 0x00, 0x00, 0x03, 0x00, 0x03, 0x02,
  0x00, 0x5b, 0x8d, 0x80, 0x0b, 0x00, 0x00, 0x03, 0x00, 0x00, 0x03, 0x00, 0x00,
  0x03, 0x00, 0xd2, 0x0c, 0x03, 0x91, 0x1d, 0x01,
])

const readUint32 = (bytes: Uint8Array, offset: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
  )

const boxType = (bytes: Uint8Array, offset: number): string =>
  String.fromCharCode(
    bytes[offset + 4],
    bytes[offset + 5],
    bytes[offset + 6],
    bytes[offset + 7],
  )

const zeroRange = (bytes: Uint8Array, start: number, length: number): void => {
  bytes.fill(0, start, start + length)
}

const canonicalizeTimestampBoxes = (
  bytes: Uint8Array,
  start: number,
  end: number,
): void => {
  let offset = start
  while (offset + 8 <= end) {
    const size = readUint32(bytes, offset)
    if (size < 8 || offset + size > end) {
      throw new Error('MP4 contains an invalid box size')
    }

    const type = boxType(bytes, offset)
    const payloadStart = offset + 8
    if (TIMESTAMP_BOXES.has(type)) {
      const version = bytes[payloadStart]
      if (version === 0) {
        zeroRange(bytes, payloadStart + 4, 8)
      } else if (version === 1) {
        zeroRange(bytes, payloadStart + 4, 16)
      } else {
        throw new Error(`Unsupported ${type} MP4 box version: ${version}`)
      }
    }

    if (CONTAINER_BOXES.has(type)) {
      canonicalizeTimestampBoxes(bytes, payloadStart, offset + size)
    }
    offset += size
  }
}

const matchesAt = (
  bytes: Uint8Array,
  pattern: Uint8Array,
  offset: number,
): boolean => pattern.every((value, index) => bytes[offset + index] === value)

const canonicalizeChromiumSei = (bytes: Uint8Array): void => {
  let replacements = 0
  for (
    let offset = 0;
    offset <= bytes.length - CHROMIUM_SEI_PREFIX.length;
    offset += 1
  ) {
    if (!matchesAt(bytes, CHROMIUM_SEI_PREFIX, offset)) continue

    const payloadStart = offset + CHROMIUM_SEI_PREFIX.length
    const payloadEnd = payloadStart + CANONICAL_CHROMIUM_SEI_PAYLOAD.length
    if (payloadEnd >= bytes.length || bytes[payloadEnd] !== 0x80) {
      throw new Error('Chromium MP4 SEI payload shape changed')
    }
    bytes.set(CANONICAL_CHROMIUM_SEI_PAYLOAD, payloadStart)
    replacements += 1
  }

  if (replacements !== 1) {
    throw new Error(
      `Expected one Chromium MP4 SEI payload, found ${replacements}`,
    )
  }
}

export const canonicalizeChromiumMp4 = (input: Uint8Array): Uint8Array => {
  const output = Uint8Array.from(input)
  canonicalizeTimestampBoxes(output, 0, output.length)
  canonicalizeChromiumSei(output)
  return output
}
