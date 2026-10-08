import { assert, describe, expect, it } from 'vitest'
import { isNormalizedName, parseCanonicalName, parseName } from './name-parser'

describe('parseName', () => {
  it('parses a plain label as an .eth name', () => {
    const result = parseName('vitalik')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: [],
      label: 'vitalik',
      tld: 'eth',
      name: 'vitalik.eth',
    })
  })

  it('trims whitespace and lowercases the name before parsing', () => {
    const result = parseName('  ViTaLik.ETH  ')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: [],
      label: 'vitalik',
      tld: 'eth',
      name: 'vitalik.eth',
    })
  })

  it('parses subnames and keeps sublabels in order', () => {
    const result = parseName('deep.sub.vitalik.eth')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: ['deep', 'sub'],
      label: 'vitalik',
      tld: 'eth',
      name: 'deep.sub.vitalik.eth',
    })
  })

  it('parses non-.eth TLDs and allows emoji and hyphen labels', () => {
    const result = parseName('sub.my-name🚀.xyz')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: ['sub'],
      label: 'my-name🚀',
      tld: 'xyz',
      name: 'sub.my-name🚀.xyz',
    })
  })

  it('returns an error when the name contains spaces', () => {
    const result = parseName('my name.eth')

    assert(result.isErr())
    expect(result.error).toMatchObject({
      reason: 'SPACE_NOT_ALLOWED',
    })
  })

  it('returns an error when the name contains unsupported whitespace', () => {
    const result = parseName('my\tname.eth')

    assert(result.isErr())
    expect(result.error).toMatchObject({
      reason: 'SPACE_NOT_ALLOWED',
    })
  })

  it('returns an error when a label contains an invalid character', () => {
    const result = parseName('bad!.vitalik.eth')

    assert(result.isErr())
    expect(result.error).toMatchObject({
      reason: 'INVALID_CHARACTER',
    })
  })

  it('returns an error when the tld contains an invalid character', () => {
    const result = parseName('vitalik.e!h')

    assert(result.isErr())
    expect(result.error).toMatchObject({
      reason: 'INVALID_CHARACTER',
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

  it('exposes the normalised name the labels were taken from', () => {
    const result = parseName('  ALICE.ETH  ')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: [],
      label: 'alice',
      tld: 'eth',
      name: 'alice.eth',
    })
  })

  it.each([
    ['a zero-width space', 'ali\u200bce.eth'],
    ['a zero-width non-joiner', 'ali\u200cce.eth'],
    ['a stray variation selector', 'alice\ufe0f.eth'],
    ['a circled-letter confusable', 'alice\u24dd.eth'],
    ['a soft hyphen', 'ali\u00adce.eth'],
  ])('refuses a name containing %s rather than silently rewriting it', (_label, name) => {
    // `normalize` maps these away instead of rejecting them, so the name the
    // user is shown would hash to a different label than the one displayed.
    const result = parseName(name)

    assert(result.isErr())
    expect(result.error).toMatchObject({
      reason: 'NOT_NORMALIZED',
    })
  })

  it('refuses a label that ENSIP-15 normalisation rejects outright', () => {
    const result = parseName('alice\u0000.eth')

    assert(result.isErr())
    expect(result.error).toMatchObject({
      reason: 'NOT_NORMALIZED',
    })
  })

  it('ignores leading and trailing dots around an otherwise valid name', () => {
    const result = parseName('.sub.vitalik.eth.')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: ['sub'],
      label: 'vitalik',
      tld: 'eth',
      name: 'sub.vitalik.eth',
    })
  })
})

describe('parseCanonicalName', () => {
  it('reports a name that is already canonical as unrewritten', () => {
    const result = parseCanonicalName('vitalik.eth')

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: [],
      label: 'vitalik',
      tld: 'eth',
      name: 'vitalik.eth',
      wasRewritten: false,
    })
  })

  it('does not count case folding as a rewrite', () => {
    const result = parseCanonicalName('VITALIK.ETH')

    assert(result.isOk())
    expect(result.value).toMatchObject({
      label: 'vitalik',
      name: 'vitalik.eth',
      wasRewritten: false,
    })
  })

  it.each([
    ['a fullwidth look-alike', 'ｖｉｔａｌｉｋ.eth', 'vitalik.eth'],
    ['a soft hyphen', 'vi­talik.eth', 'vitalik.eth'],
    ['a zero-width space', 'vitalik​.eth', 'vitalik.eth'],
    ['a circled-letter confusable', 'vitalikⓝ.eth', 'vitalikn.eth'],
    ['a stray variation selector', 'thumbs\u{1f44d}️.eth', 'thumbs👍.eth'],
    ['an NFD accent', 'cafés.eth', 'cafés.eth'],
  ])('canonicalises %s and flags it as rewritten', (_case, name, canonicalName) => {
    const result = parseCanonicalName(name)

    assert(result.isOk())
    expect(result.value).toMatchObject({
      name: canonicalName,
      wasRewritten: true,
    })
  })

  it.each([
    ['an xn-- extension', 'xn--ls8h.eth'],
    ['a zero-width non-joiner', 'vitalik\u200c.eth'],
    ['a null character', 'vitalik\u0000.eth'],
  ])('refuses %s, which has no canonical form', (_case, name) => {
    const result = parseCanonicalName(name)

    assert(result.isErr())
    expect(result.error).toMatchObject({ reason: 'NOT_NORMALIZED' })
  })

  it('refuses a bracket-encoded labelhash', () => {
    const result = parseCanonicalName('[deadbeef].eth')

    assert(result.isErr())
    expect(result.error).toMatchObject({ reason: 'INVALID_CHARACTER' })
  })
})

describe('isNormalizedName', () => {
  it.each([
    ['a plain name', 'alice.eth'],
    ['a subname', 'sub.alice.eth'],
    ['an emoji name', '\u{1f680}\u{1f680}\u{1f680}.eth'],
    ['a whole-script Cyrillic name', '\u0455\u0441\u0430\u043c.eth'],
    ['an encoded labelhash (unknown label)', `[${'ab'.repeat(32)}].eth`],
  ])('accepts %s', (_case, name) => {
    expect(isNormalizedName(name)).toBe(true)
  })

  it.each([
    ['uppercase', 'ALICE.eth'],
    ['a soft hyphen', 'ali\u00adce.eth'],
    ['a fullwidth look-alike', '\uff41lice.eth'],
    ['Cyrillic letters mixed into a Latin label', '\u0430lice.eth'],
    ['a bidi override', 'al\u202eice.eth'],
    ['an empty label', '.alice.eth'],
  ])('refuses a stored name with %s', (_case, name) => {
    expect(isNormalizedName(name)).toBe(false)
  })
})
