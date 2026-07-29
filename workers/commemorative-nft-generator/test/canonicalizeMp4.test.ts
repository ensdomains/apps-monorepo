import { describe, expect, it } from 'vitest'
import { canonicalizeChromiumMp4 } from '../src/canonicalizeMp4.js'

const box = (type: string, payload: readonly number[]): number[] => {
  const size = 8 + payload.length
  return [
    (size >>> 24) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 8) & 0xff,
    size & 0xff,
    ...type.split('').map((value) => value.charCodeAt(0)),
    ...payload,
  ]
}

const sei = (timeByte: number): number[] => [
  0x06,
  0x05,
  0x2d,
  0x47,
  0x56,
  0x4a,
  0xdc,
  0x5c,
  0x4c,
  0x43,
  0x3f,
  0x94,
  0xef,
  0xc5,
  0x11,
  0x3c,
  0xd1,
  0x43,
  0xa8,
  0x01,
  0x00,
  0x00,
  0x03,
  0x00,
  0x01,
  0x03,
  0x00,
  0x00,
  0x03,
  0x00,
  0x03,
  0x02,
  0x00,
  0x5b,
  0x8d,
  0x80,
  0x0b,
  0x00,
  0x00,
  0x03,
  0x00,
  0x00,
  0x03,
  0x00,
  0x00,
  0x03,
  0x00,
  timeByte,
  0x0c,
  0x03,
  0x91,
  0x1d,
  0x01,
  0x80,
]

const fixture = (timeByte: number, timestamp: number): Uint8Array =>
  Uint8Array.from([
    ...box('ftyp', []),
    ...box('moov', [
      ...box('mvhd', [0, 0, 0, 0, 0, 0, 0, timestamp, 0, 0, 0, timestamp]),
    ]),
    ...box('mdat', sei(timeByte)),
  ])

describe('MP4 canonicalization', () => {
  it('removes container and Chromium SEI wall-clock differences', () => {
    const first = canonicalizeChromiumMp4(fixture(0xd2, 1))
    const second = canonicalizeChromiumMp4(fixture(0xf0, 2))
    expect(first).toEqual(second)
  })

  it('fails closed when the pinned Chromium SEI fingerprint changes', () => {
    const value = fixture(0xd2, 1)
    value[value.length - 1] = 0
    expect(() => canonicalizeChromiumMp4(value)).toThrow(
      'Chromium MP4 SEI payload shape changed',
    )
  })
})
