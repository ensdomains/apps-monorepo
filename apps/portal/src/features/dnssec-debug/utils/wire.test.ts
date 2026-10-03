import { describe, expect, it } from 'vitest'
import type { DnskeyAnswer } from '../types'
import {
  computeKeyTag,
  countLabels,
  decodeTxtData,
  encodeDnsName,
  getAncestry,
  getParentZone,
  isProperAncestor,
  normalizeDnsName,
} from './wire'

// The root zone's KSK-2017, key tag 20326 (IANA root-anchors.xml).
const ROOT_KSK_2017 =
  'AwEAAaz/tAm8yTn4Mfeh5eyI96WSVexTBAvkMgJzkKTOiW1vkIbzxeF3+/4RgWOq7HrxRixHlFlExOLAJr5emLvN7SWXgnLh4+B5xQlNVz8Og8kvArMtNROxVQuCaSnIDdD5LKyWbRd2n9WGe2R8PzgCmr3EgVLrjyBxWezF0jLHwVN8efS3rCj/EWgvIWgb9tarpVUDK/b58Da+sqqls3eNbuv7pr+eoZG+SrDK6nWeL3c6H5Apxz7LjVc1uTIdsIXxuOLYA4/ilBmSVIzuDWfdRUfhHdY6+cn8HFRm+2hM8AnXGXws9555KrUB5qihylGa8subX2Nn6UwNR1AkUTV74bU='

describe('DNS name helpers', () => {
  it('normalizes names to lowercase without a trailing dot', () => {
    expect(normalizeDnsName('Example.COM.')).toBe('example.com')
    expect(normalizeDnsName('')).toBe('.')
    expect(normalizeDnsName('.')).toBe('.')
  })

  it('walks parents and ancestry up to the root', () => {
    expect(getParentZone('a.example.com')).toBe('example.com')
    expect(getParentZone('com')).toBe('.')
    expect(getParentZone('.')).toBeNull()
    expect(getAncestry('example.co.uk')).toEqual([
      '.',
      'uk',
      'co.uk',
      'example.co.uk',
    ])
  })

  it('only treats strict parent domains as ancestors', () => {
    expect(isProperAncestor('com', 'example.com')).toBe(true)
    expect(isProperAncestor('.', 'com')).toBe(true)
    expect(isProperAncestor('ple.com', 'example.com')).toBe(false)
    expect(isProperAncestor('example.com', 'example.com')).toBe(false)
  })

  it('counts labels excluding the root', () => {
    expect(countLabels('.')).toBe(0)
    expect(countLabels('_ens.example.com')).toBe(3)
  })

  it('encodes names in lowercase wire format', () => {
    expect([...encodeDnsName('Ab.c')]).toEqual([2, 97, 98, 1, 99, 0])
    expect([...encodeDnsName('.')]).toEqual([0])
  })

  it('joins TXT character-strings', () => {
    const encoder = new TextEncoder()
    expect(decodeTxtData([encoder.encode('a=0x'), encoder.encode('12')])).toBe(
      'a=0x12',
    )
  })
})

describe('computeKeyTag', () => {
  it('matches the key tag IANA publishes for the root KSK', () => {
    const key: DnskeyAnswer = {
      name: '.',
      type: 'DNSKEY',
      class: 'IN',
      ttl: 172800,
      data: {
        flags: 257,
        algorithm: 8,
        key: Buffer.from(ROOT_KSK_2017, 'base64'),
      },
    }
    expect(computeKeyTag(key)).toBe(20326)
  })
})
