import { describe, expect, it } from 'vitest'
import { chunkArray } from './chunkArray'

describe('chunkArray', () => {
  it('returns an empty array for an empty input', () => {
    expect(chunkArray([], 50)).toEqual([])
  })

  it('returns a single chunk when input length is less than size', () => {
    expect(chunkArray([1], 50)).toEqual([[1]])
  })

  it('returns a single chunk when input length equals size', () => {
    const input = Array.from({ length: 50 }, (_, i) => i)
    const result = chunkArray(input, 50)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(input)
  })

  it('splits a remainder into its own trailing chunk', () => {
    const input = Array.from({ length: 51 }, (_, i) => i)
    const result = chunkArray(input, 50)
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveLength(50)
    expect(result[1]).toEqual([50])
  })

  it('splits into exact multiples without a trailing partial chunk', () => {
    const input = Array.from({ length: 100 }, (_, i) => i)
    const result = chunkArray(input, 50)
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveLength(50)
    expect(result[1]).toHaveLength(50)
  })

  it('splits into many small chunks when size is 1', () => {
    expect(chunkArray([1, 2, 3], 1)).toEqual([[1], [2], [3]])
  })

  it('returns a single chunk when size exceeds length', () => {
    expect(chunkArray([1, 2, 3], 1000)).toEqual([[1, 2, 3]])
  })

  it('preserves element order across chunks', () => {
    const input = [1, 2, 3, 4, 5, 6, 7]
    const flattened = chunkArray(input, 3).flat()
    expect(flattened).toEqual(input)
  })

  it('preserves element identity (shallow copy, no clones)', () => {
    const a = { n: 1 }
    const b = { n: 2 }
    const result = chunkArray([a, b], 1)
    expect(result[0]![0]).toBe(a)
    expect(result[1]![0]).toBe(b)
  })

  it('accepts a readonly input array', () => {
    const input: readonly number[] = [1, 2, 3, 4]
    expect(chunkArray(input, 2)).toEqual([
      [1, 2],
      [3, 4],
    ])
  })
})
