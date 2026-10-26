import { describe, expect, it } from 'vitest'
import { inspectProfileImage } from './image'

const jpeg = [
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01,
  0x11, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x01,
  0xff, 0xd9,
]
const changed = (offset: number, value: number) =>
  jpeg.map((byte, index) => (index === offset ? value : byte))

describe('JPEG upload container validation', () => {
  it.each([
    ['baseline', jpeg],
    ['progressive', changed(3, 0xc2)],
    [
      'stuffed entropy and restart markers',
      [...jpeg.slice(0, -2), 0xff, 0x00, 0xff, 0xd0, 1, 0xff, 0xd9],
    ],
    [
      'comment segment',
      [...jpeg.slice(0, 2), 0xff, 0xfe, 0, 4, 1, 2, ...jpeg.slice(2)],
    ],
  ])('accepts a complete %s JPEG', (_description, bytes) => {
    expect(inspectProfileImage(Uint8Array.from(bytes))).toEqual({
      mimeType: 'image/jpeg',
      animated: false,
    })
  })

  it.each([
    ['empty input', []],
    ['PNG signature', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['missing frame', [...jpeg.slice(0, 2), ...jpeg.slice(15)]],
    ['missing scan', [...jpeg.slice(0, 15), 0xff, 0xd9]],
    ['empty scan', [...jpeg.slice(0, 25), 0xff, 0xd9]],
    ['truncated end marker', jpeg.slice(0, -1)],
    ['trailing data', [...jpeg, 0]],
    ['zero height', changed(8, 0)],
    ['zero width', changed(10, 0)],
    ['zero components', changed(11, 0)],
    ['too many components', changed(11, 5)],
    ['invalid frame length', changed(5, 10)],
    ['invalid scan length', changed(18, 7)],
    ['segment extending beyond input', changed(5, 255)],
  ])('rejects %s', (_description, bytes) => {
    expect(inspectProfileImage(Uint8Array.from(bytes))).toBeNull()
  })

  it('validates only the supplied byte view, excluding surrounding buffer data', () => {
    const buffer = Uint8Array.from([0, ...jpeg, 0])
    expect(inspectProfileImage(buffer.subarray(1, -1))?.mimeType).toBe(
      'image/jpeg',
    )
    expect(inspectProfileImage(buffer)).toBeNull()
  })
})
