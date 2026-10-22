import type { ProfileImageMime } from './index'

type ImageInfo = { mimeType: ProfileImageMime; animated: false }
type Reader = { bytes: Uint8Array; length: number; view: DataView }

const inspectJpeg = (reader: Reader): ImageInfo | null => {
  const { bytes, length, view } = reader
  if (length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let cursor = 2
    let frame = false
    let scan = false
    let componentCount = 0
    while (cursor < length) {
      if (bytes[cursor++] !== 0xff) return null
      while (bytes[cursor] === 0xff) cursor++
      const marker = bytes[cursor++] ?? 0
      if (marker === 0xd9)
        return cursor === length && frame && scan
          ? { mimeType: 'image/jpeg', animated: false }
          : null
      if (marker === 0 || marker === 0xd8 || cursor + 2 > length) return null
      const size = view.getUint16(cursor)
      if (size < 2 || cursor + size > length) return null
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        componentCount = bytes[cursor + 7] ?? 0
        if (
          size < 8 ||
          componentCount < 1 ||
          componentCount > 4 ||
          size !== 8 + 3 * componentCount ||
          !view.getUint16(cursor + 3) ||
          !view.getUint16(cursor + 5)
        )
          return null
        frame = true
      }
      if (
        marker === 0xda &&
        (size < 6 ||
          !(bytes[cursor + 2] ?? 0) ||
          (bytes[cursor + 2] ?? 0) > componentCount ||
          size !== 6 + 2 * (bytes[cursor + 2] ?? 0))
      )
        return null
      cursor += size
      if (marker === 0xda) {
        if (!frame) return null
        scan = true
        const scanStart = cursor
        while (cursor < length) {
          if (bytes[cursor] !== 0xff) {
            cursor++
            continue
          }
          const next = bytes[cursor + 1] ?? 0
          if (next === 0 || (next >= 0xd0 && next <= 0xd7)) {
            cursor += 2
            continue
          }
          break
        }
        if (cursor === scanStart) return null
      }
    }
  }
  return null
}

/** Validate the JPEG container before accepting bytes into storage. */
export const inspectProfileImage = (bytes: Uint8Array): ImageInfo | null =>
  inspectJpeg({
    bytes,
    length: bytes.length,
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.length),
  })
