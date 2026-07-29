import { createHash } from 'node:crypto'
import { UnsupportedRendererOutputError } from './errors.js'

const PNG_SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

const includesAscii = (bytes: Uint8Array, value: string): boolean => {
  const pattern = new TextEncoder().encode(value)
  for (let index = 0; index <= bytes.length - pattern.length; index += 1) {
    if (
      pattern.every(
        (patternByte, patternIndex) =>
          bytes[index + patternIndex] === patternByte,
      )
    ) {
      return true
    }
  }
  return false
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
  if (
    bytes.byteLength <= PNG_SIGNATURE.byteLength ||
    !PNG_SIGNATURE.every((value, index) => bytes[index] === value)
  ) {
    throw new UnsupportedRendererOutputError(
      'Renderer output is not a valid non-empty PNG',
    )
  }
}

export const validateH264Mp4 = (bytes: Uint8Array): void => {
  if (
    bytes.byteLength < 16 ||
    !includesAscii(bytes.subarray(0, Math.min(bytes.length, 64)), 'ftyp') ||
    !includesAscii(bytes, 'avc1')
  ) {
    throw new UnsupportedRendererOutputError(
      'Renderer output is not a valid H.264 MP4',
    )
  }
}
