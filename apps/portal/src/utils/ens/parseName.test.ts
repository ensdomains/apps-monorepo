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
})
