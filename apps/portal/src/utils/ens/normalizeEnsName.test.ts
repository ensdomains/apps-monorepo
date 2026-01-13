import { describe, expect, it } from 'vitest'
import { normalizeEnsName } from './normalizeEnsName'

describe('normalizeEnsName', () => {
  it('should append .eth to names without a dot', () => {
    expect(normalizeEnsName('vitalik')).toBe('vitalik.eth')
    expect(normalizeEnsName('alice')).toBe('alice.eth')
    expect(normalizeEnsName('test123')).toBe('test123.eth')
  })

  it('should return names with dots as-is (lowercased)', () => {
    expect(normalizeEnsName('vitalik.eth')).toBe('vitalik.eth')
    expect(normalizeEnsName('sub.vitalik.eth')).toBe('sub.vitalik.eth')
    expect(normalizeEnsName('test.xyz')).toBe('test.xyz')
  })

  it('should lowercase the entire result', () => {
    expect(normalizeEnsName('Vitalik')).toBe('vitalik.eth')
    expect(normalizeEnsName('VITALIK')).toBe('vitalik.eth')
    expect(normalizeEnsName('Vitalik.ETH')).toBe('vitalik.eth')
    expect(normalizeEnsName('Sub.Vitalik.ETH')).toBe('sub.vitalik.eth')
  })

  it('should handle empty strings', () => {
    expect(normalizeEnsName('')).toBe('.eth')
  })
})
