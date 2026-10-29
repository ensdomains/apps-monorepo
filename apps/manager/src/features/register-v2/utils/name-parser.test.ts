import { assert, describe, expect, it } from 'vitest'
import { isNormalizedName, parseCanonicalName, parseName } from './name-parser'
import {
  PRESERVED_REFERENCE_NAMES,
  REJECTED_REFERENCE_NAMES,
  REWRITTEN_REFERENCE_NAMES,
} from './name-parser.fixtures'

describe('ENSIP-15 reference outcomes', () => {
  it.each(PRESERVED_REFERENCE_NAMES)(
    'accepts %s in registration and strict parsing',
    (_case, input, name) => {
      const canonical = parseCanonicalName(input)
      const strict = parseName(input)

      assert(canonical.isOk())
      expect(canonical.value).toMatchObject({ name, wasRewritten: false })
      assert(strict.isOk())
      expect(strict.value.name).toBe(name)
    },
  )

  it.each(REWRITTEN_REFERENCE_NAMES)(
    'canonicalizes %s for registration and refuses it for an existing name',
    (_case, input, name) => {
      const canonical = parseCanonicalName(input)
      const strict = parseName(input)

      assert(canonical.isOk())
      expect(canonical.value).toMatchObject({ name, wasRewritten: true })
      assert(strict.isErr())
      expect(strict.error.reason).toBe('NOT_NORMALIZED')
    },
  )

  it.each(REJECTED_REFERENCE_NAMES)(
    'rejects %s in registration and strict parsing',
    (_case, input, reason) => {
      const canonical = parseCanonicalName(input)
      const strict = parseName(input)

      assert(canonical.isErr())
      expect(canonical.error.reason).toBe(reason)
      assert(strict.isErr())
      expect(strict.error.reason).toBe(reason)
    },
  )
})

describe('parseName', () => {
  it.each(['agent$', '$agent', 'ag$ent', '$$$'])(
    'accepts the canonical dollar-sign label %s',
    (label) => {
      const result = parseName(`${label}.eth`)

      assert(result.isOk())
      expect(result.value).toEqual({
        subLabels: [],
        label,
        tld: 'eth',
        name: `${label}.eth`,
      })
    },
  )

  it('refuses an apostrophe rewrite when acting on an existing name', () => {
    const result = parseName("o'connor.eth")

    assert(result.isErr())
    expect(result.error.reason).toBe('NOT_NORMALIZED')
  })

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
      reason: 'INVALID_NAME',
    })
  })

  it('returns an error when the tld contains an invalid character', () => {
    const result = parseName('vitalik.e!h')

    assert(result.isErr())
    expect(result.error).toMatchObject({
      reason: 'INVALID_NAME',
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
    ['a stray variation selector', 'alice\ufe0f.eth'],
    ['a circled-letter confusable', 'alice\u24dd.eth'],
    ['a soft hyphen', 'ali\u00adce.eth'],
  ])(
    'refuses a name containing %s rather than silently rewriting it',
    (_label, name) => {
      // `normalize` maps these away instead of rejecting them, so the name the
      // user is shown would hash to a different label than the one displayed.
      const result = parseName(name)

      assert(result.isErr())
      expect(result.error).toMatchObject({
        reason: 'NOT_NORMALIZED',
      })
    },
  )

  it.each(['alice\u0000.eth', 'ali\u200cce.eth'])(
    'reports an invalid name when ENSIP-15 rejects %s outright',
    (name) => {
      const result = parseName(name)

      assert(result.isErr())
      expect(result.error).toMatchObject({
        reason: 'INVALID_NAME',
      })
    },
  )

  // Stray dots are dropped; the register/renew routes redirect to the result.
  it.each([
    ['a leading dot', '.vitalik.eth'],
    ['a trailing dot', 'vitalik.eth.'],
    ['dots on both ends', '.sub.vitalik.eth.'],
    ["the audit's `.eth.eth`", '.eth.eth'],
  ])('canonicalises %s to the dotless name', (_case, name) => {
    const result = parseName(name)

    assert(result.isOk())
    expect(result.value.name).toBe(name.replace(/^\.|\.$/g, ''))
  })

  // Homograph inputs from the WEB-334 audit
  describe('homograph and display-trick inputs', () => {
    it.each([
      ['a right-to-left override', 'ev\u202eil.eth'],
      ['a left-to-right override', 'ev\u202dil.eth'],
      ['a left-to-right isolate', 'ev\u2066il.eth'],
      ['a pop-directional-isolate', 'ev\u2069il.eth'],
      ['a zero-width joiner outside an emoji sequence', 'vi\u200dtalik.eth'],
      ['a C0 control character', 'vita\u0001lik.eth'],
      ['a DEL control character', 'vita\u007flik.eth'],
      ['an invisible separator', 'vita\u2063lik.eth'],
    ])('refuses a name containing %s', (_case, name) => {
      const result = parseName(name)

      assert(result.isErr())
      expect(result.error).toMatchObject({ reason: 'INVALID_NAME' })
    })

    it('refuses a Latin name with Cyrillic look-alike letters mixed in', () => {
      // Cyrillic і and а in a Latin label
      const result = parseName('v\u0456t\u0430lik.eth')

      assert(result.isErr())
      expect(result.error).toMatchObject({ reason: 'INVALID_NAME' })
    })

    it('accepts a whole-script Cyrillic name, which ENSIP-15 allows', () => {
      // Valid per ENSIP-15, so the parser can't refuse it. Display-level
      // warning is a separate ticket.
      const result = parseName('\u0455\u0441\u0430\u043c.eth')

      assert(result.isOk())
      expect(result.value.name).toBe('\u0455\u0441\u0430\u043c.eth')
    })

    it('still accepts emoji names, which are legitimately non-NFC', () => {
      const result = parseName('\u{1f680}\u{1f680}\u{1f680}.eth')

      assert(result.isOk())
      expect(result.value.label).toBe('\u{1f680}\u{1f680}\u{1f680}')
    })
  })
})

describe('parseCanonicalName', () => {
  it.each(['ab--cd.eth', 'ab--cd$.eth', 'alice\u0000.eth'])(
    'reports a normalization failure without guessing its cause for %s',
    (name) => {
      const result = parseCanonicalName(name)

      assert(result.isErr())
      expect(result.error.reason).toBe('INVALID_NAME')
      expect(result.error.message).toBe(
        'This name does not meet ENS naming rules.',
      )
    },
  )

  // Application integration cases from ENSIP-15's Normalize, Tokenize,
  // Validate and Derivation sections: https://docs.ens.domains/ensip/15/
  // Keep expected spellings explicit: calling normalize() to compute them
  // would hide regressions in the parser's normalization boundary.
  describe('ENSIP-15 integration', () => {
    it.each([
      ['ASCII dollar sign with a leading underscore', '_$A', '_$a', false],
      ['an underscore-only label', '___', '___', false],
      ['multiple leading underscores', '__abc', '__abc', false],
      ['a hyphen in the third position only', 'ab-c', 'ab-c', false],
      ['hyphens outside the reserved extension pattern', '---a', '---a', false],
      ['an interior fenced character', 'a\u2044b', 'a\u2044b', false],
      [
        'a valid emoji joiner sequence',
        '\u{1f468}\u200d\u{1f4bb}',
        '\u{1f468}\u200d\u{1f4bb}',
        false,
      ],
      ['mapping followed by NFC composition', 'E\ufe0e\u0303', '\u1ebd', true],
      ['an expanding character mapping', 'a\u2122\ufe0f', 'atm', true],
    ])(
      'preserves ENSIP-15 handling of %s',
      (_case, input, label, wasRewritten) => {
        const result = parseCanonicalName(`${input}.eth`)

        assert(result.isOk())
        expect(result.value).toEqual({
          subLabels: [],
          label,
          tld: 'eth',
          name: `${label}.eth`,
          wasRewritten,
        })
      },
    )

    it.each([
      ['trailing underscores', 'abc__'],
      ['underscores after the leading run', '_abc_'],
      ['a leading fenced character', '\u2044ab'],
      ['a trailing fenced character', 'ab\u2044'],
      ['consecutive fenced characters', 'a\u2044\u2044b'],
      ['a leading combining mark', '\u0301abc'],
      ['a disallowed dotless-i sequence', 'n\u0131\u0307ck'],
      ['a joiner between incompatible emoji', '\u{1f4a9}\u200d\u{1f4a9}'],
      ['an ideographic full stop', 'abc\u3002eth'],
      ['a fullwidth full stop', 'abc\uff0eeth'],
      ['a halfwidth ideographic full stop', 'abc\uff61eth'],
    ])('does not admit %s through canonicalization', (_case, label) => {
      const result = parseCanonicalName(`${label}.eth`)

      assert(result.isErr())
      expect(result.error.reason).toBe('INVALID_NAME')
    })

    it('normalizes every label before extracting the registrable label', () => {
      const result = parseCanonicalName('a\u2122\ufe0f._$A.ETH')

      assert(result.isOk())
      expect(result.value).toEqual({
        subLabels: ['atm'],
        label: '_$a',
        tld: 'eth',
        name: 'atm._$a.eth',
        wasRewritten: true,
      })
    })

    it.each(['abc__.alice.eth', 'alice.abc__'])(
      'rejects contextual violations outside the registrable label in %s',
      (name) => {
        const result = parseCanonicalName(name)

        assert(result.isErr())
        expect(result.error.reason).toBe('INVALID_NAME')
      },
    )
  })

  it.each([
    ['agent$.eth', 'agent$.eth', false],
    ["o'connor.eth", 'o\u2019connor.eth', true],
    ['#\ufe0f\u20e3abc.eth', '#\u20e3abc.eth', true],
    ['*\ufe0f\u20e3abc.eth', '*\u20e3abc.eth', true],
  ])('accepts and canonicalises %s', (input, name, wasRewritten) => {
    const result = parseCanonicalName(input)

    assert(result.isOk())
    expect(result.value).toEqual({
      subLabels: [],
      label: name.slice(0, -4),
      tld: 'eth',
      name,
      wasRewritten,
    })
  })

  it.each(['agent!.eth', 'agent&.eth', 'agent#.eth', 'agent*.eth'])(
    'rejects disallowed punctuation in %s',
    (name) => {
      const result = parseCanonicalName(name)

      assert(result.isErr())
      expect(result.error.reason).toBe('INVALID_NAME')
    },
  )

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
  ])(
    'canonicalises %s and flags it as rewritten',
    (_case, name, canonicalName) => {
      const result = parseCanonicalName(name)

      assert(result.isOk())
      expect(result.value).toMatchObject({
        name: canonicalName,
        wasRewritten: true,
      })
    },
  )

  it.each([
    ['an xn-- extension', 'xn--ls8h.eth'],
    ['a zero-width non-joiner', 'vitalik\u200c.eth'],
    ['a null character', 'vitalik\u0000.eth'],
  ])('refuses %s, which has no canonical form', (_case, name) => {
    const result = parseCanonicalName(name)

    assert(result.isErr())
    expect(result.error).toMatchObject({ reason: 'INVALID_NAME' })
  })

  it('refuses a bracket-encoded labelhash', () => {
    const result = parseCanonicalName('[deadbeef].eth')

    assert(result.isErr())
    expect(result.error).toMatchObject({ reason: 'INVALID_NAME' })
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
