import { assert, describe, expect, it } from 'vitest'
import { parseName } from './name-parser'

describe('parseName', () => {
  it('parses a plain label as an .eth name', () => {
    const result = parseName('vitalik')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: [],
      label: 'vitalik',
      tld: 'eth',
    })
  })

  it('trims whitespace and lowercases the name before parsing', () => {
    const result = parseName('  ViTaLik.ETH  ')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: [],
      label: 'vitalik',
      tld: 'eth',
    })
  })

  it('parses subnames and keeps sublabels in order', () => {
    const result = parseName('deep.sub.vitalik.eth')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: ['deep', 'sub'],
      label: 'vitalik',
      tld: 'eth',
    })
  })

  it('parses non-.eth TLDs and allows emoji and hyphen labels', () => {
    const result = parseName('sub.my-name🚀.xyz')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: ['sub'],
      label: 'my-name🚀',
      tld: 'xyz',
    })
  })

  it('returns an error when the name contains spaces', () => {
    const result = parseName('my name.eth')

    assert(result.isErr())
    expect(result.error).toMatchObject({
      reason: 'SPACE_NOT_ALLOWED',
    })
  })

  it('returns an error when the name contains consecutive dots', () => {
    const result = parseName('sub..vitalik.eth')

    assert(result.isErr())
    expect(result.error).toMatchObject({
      reason: 'MULTIPLE_CONSECUTIVE_DOTS',
    })
  })

  it('returns an error when no label can be found', () => {
    const result = parseName('   ')

    assert(result.isErr())
    expect(result.error).toMatchObject({
      reason: 'LABEL_NOT_FOUND',
    })
  })

  it('ignores leading and trailing dots around an otherwise valid name', () => {
    const result = parseName('.sub.vitalik.eth.')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: ['sub'],
      label: 'vitalik',
      tld: 'eth',
    })
  })
})
