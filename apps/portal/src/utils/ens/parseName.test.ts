import { describe, expect, it } from 'vitest'
import { parseName } from './parseName'

describe('parseName', () => {
  it('should parse a standard second-level domain', () => {
    const result = parseName('vitalik.eth')

    expect(result).toEqual({
      labels: ['vitalik'],
      parent: 'eth',
    })
  })

  it('should parse a subdomain', () => {
    const result = parseName('sub.vitalik.eth')

    expect(result).toEqual({
      labels: ['sub', 'vitalik'],
      parent: 'eth',
    })
  })

  it('should parse a deeply nested subdomain', () => {
    const result = parseName('a.b.c.vitalik.eth')

    expect(result).toEqual({
      labels: ['a', 'b', 'c', 'vitalik'],
      parent: 'eth',
    })
  })

  it('should parse a TLD-only name', () => {
    const result = parseName('eth')

    expect(result).toEqual({
      labels: [],
      parent: 'eth',
    })
  })

  it('should handle empty string', () => {
    const result = parseName('')

    expect(result).toEqual({
      labels: [],
      parent: '',
    })
  })

  it('should handle single character names', () => {
    const result = parseName('a.b')

    expect(result).toEqual({
      labels: ['a'],
      parent: 'b',
    })
  })

  it('should parse names with alternative TLDs', () => {
    const result = parseName('example.xyz')

    expect(result).toEqual({
      labels: ['example'],
      parent: 'xyz',
    })
  })

  it('should parse names with dashes and numbers', () => {
    const result = parseName('my-name-123.eth')

    expect(result).toEqual({
      labels: ['my-name-123'],
      parent: 'eth',
    })
  })
})
