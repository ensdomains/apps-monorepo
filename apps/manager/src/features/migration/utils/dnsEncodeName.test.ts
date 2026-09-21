import { describe, expect, it } from 'vitest'
import { dnsEncodeName } from './dnsEncodeName'

describe('dnsEncodeName', () => {
  it('encodes a 2LD (vitalik.eth) to the correct hex', () => {
    expect(dnsEncodeName('vitalik.eth')).toBe('0x07766974616c696b0365746800')
  })

  it('encodes an empty string to 0x00', () => {
    expect(dnsEncodeName('')).toBe('0x00')
  })

  it('encodes a 3LD with each label length', () => {
    expect(dnsEncodeName('sub.vault.eth')).toBe(
      '0x03737562057661756c740365746800',
    )
  })
})
