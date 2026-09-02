import { describe, expect, it } from 'vitest'
import { getSearchNameKind } from './getSearchNameKind'

describe('getSearchNameKind', () => {
  it('classifies a registrable 2LD', () => {
    expect(getSearchNameKind('bigint.eth')).toEqual({
      type: 'eth-2ld',
      name: 'bigint.eth',
      label: 'bigint',
    })
  })

  it('classifies a subname of any depth', () => {
    expect(getSearchNameKind('1.1.sugh004.eth')).toEqual({
      type: 'eth-subname',
      name: '1.1.sugh004.eth',
    })
  })

  it('allows subnames with short child labels', () => {
    expect(getSearchNameKind('1.sugh1405202602.eth')).toEqual({
      type: 'eth-subname',
      name: '1.sugh1405202602.eth',
    })
  })

  it('allows subnames whose 2LD label is shorter than 3', () => {
    expect(getSearchNameKind('1.1.ab.eth')).toEqual({
      type: 'eth-subname',
      name: '1.1.ab.eth',
    })
  })

  it('rejects 2LDs shorter than 3 code points', () => {
    expect(getSearchNameKind('ab.eth')).toEqual({
      type: 'invalid',
      name: 'ab.eth',
      reason: 'too-short',
    })
  })

  it('rejects invalid characters', () => {
    expect(getSearchNameKind('bad!.sugh1405202602.eth')).toMatchObject({
      type: 'invalid',
      reason: 'invalid-format',
    })
  })

  it('rejects leading or trailing dots', () => {
    expect(getSearchNameKind('.bigint.eth')).toMatchObject({
      type: 'invalid',
      reason: 'invalid-format',
    })
    expect(getSearchNameKind('bigint.eth.')).toMatchObject({
      type: 'invalid',
      reason: 'invalid-format',
    })
  })

  it('rejects unsupported TLDs', () => {
    expect(getSearchNameKind('bigint.xyz')).toEqual({
      type: 'invalid',
      name: 'bigint.xyz',
      reason: 'unsupported-tld',
    })
  })
})
