import { describe, expect, it } from 'vitest'
import {
  buildJevProfileQuestions,
  buildProfileValueContext,
  readProfileChoice,
} from './profileValueContext'

describe('local profile values and bounded model roles', () => {
  it.each([
    [
      'Use use for GitHub on pookie.eth',
      'Use [PROFILE_VALUE_1] for GitHub on pookie.eth',
      ['use'],
    ],
    [
      'Make make my GitHub on pookie.eth',
      'Make [PROFILE_VALUE_1] my GitHub on pookie.eth',
      ['make'],
    ],
    [
      'Put put in GitHub on pookie.eth',
      'Put [PROFILE_VALUE_1] in GitHub on pookie.eth',
      ['put'],
    ],
    [
      'Use use instead of old-handle as GitHub on pookie.eth',
      'Use [PROFILE_VALUE_1] instead of [PROFILE_VALUE_2] as GitHub on pookie.eth',
      ['use', 'old-handle'],
    ],
    [
      'Make make rather than old-handle as my GitHub on pookie.eth',
      'Make [PROFILE_VALUE_1] rather than [PROFILE_VALUE_2] as my GitHub on pookie.eth',
      ['make', 'old-handle'],
    ],
    [
      'Put put instead of old-handle in GitHub on pookie.eth',
      'Put [PROFILE_VALUE_1] instead of [PROFILE_VALUE_2] in GitHub on pookie.eth',
      ['put', 'old-handle'],
    ],
  ])('masks the supplied value occurrence without masking its identical instruction verb: %s', (query, state, values) => {
    const context = buildProfileValueContext(query)
    expect(context.state).toBe(state)
    expect(context.candidates.map(({ value }) => value)).toEqual(values)
    for (const candidate of context.candidates)
      expect(query.slice(candidate.start, candidate.end)).toBe(candidate.value)
  })

  it.each([
    ['set pookie.eth githb to yoginth', ['yoginth']],
    [
      'Change GitHub from bigint to yoginth for pookie.eth',
      ['bigint', 'yoginth'],
    ],
    [
      'Edit my profile pookie.eth and set github name to yoginth instead of bigint',
      ['yoginth', 'bigint'],
    ],
    ['Set GitHub on pookie.eth to yoginth, not bigint', ['yoginth', 'bigint']],
    [
      'Replace my GitHub username bigint with yoginth on pookie.eth',
      ['bigint', 'yoginth'],
    ],
    [
      'Replace pookie.eth GitHub handle bigint with yoginth',
      ['bigint', 'yoginth'],
    ],
    ['Use yoginth for GitHub on pookie.eth', ['yoginth']],
    [
      'For pookie.eth, use sample-new instead of sample-old as the GitHub handle',
      ['sample-new', 'sample-old'],
    ],
    [
      'Put sample-new rather than sample-old in the GitHub account on pookie.eth',
      ['sample-new', 'sample-old'],
    ],
    ['make yoginth my github for pookie.eth', ['yoginth']],
    ['pookie.eth github: yoginth', ['yoginth']],
    [
      'Add https://example.com/work to the links of pookie.eth',
      ['https://example.com/work'],
    ],
    ['my github is now yoginth for pookie.eth', ['yoginth']],
    ['Use Garnet theme for pookie.eth', ['Garnet']],
    [
      'Set email from old@example.com to new@example.com on pookie.eth',
      ['old@example.com', 'new@example.com'],
    ],
    [
      'Set avatar for pookie.eth to "https://example.com/image,end.png.".',
      ['https://example.com/image,end.png.'],
    ],
    [
      'set pookie.eth descreption to "I build ENS tools!"',
      ['I build ENS tools!'],
    ],
  ])('stores exact local values for %s', (query, expected) => {
    const context = buildProfileValueContext(query as string)
    expect(context.candidates.map(({ value }) => value)).toEqual(expected)
    expect(context.targetQuery).toContain('pookie.eth')
    for (const value of expected) expect(context.state).not.toContain(value)
    const questions = buildJevProfileQuestions(query as string)
    for (const value of expected)
      expect(JSON.stringify(questions)).not.toContain(value)
  })

  it('preserves instruction separators while masking literal values', () => {
    expect(
      buildProfileValueContext(
        'Change GitHub from bigint to yoginth on pookie.eth',
      ).state,
    ).toBe(
      'Change GitHub from [PROFILE_VALUE_1] to [PROFILE_VALUE_2] on pookie.eth',
    )
  })

  it('keeps a target that contains the same text as its old handle', () => {
    expect(
      buildProfileValueContext(
        'Replace pookie.eth GitHub handle pookie with yoginth',
      ).state,
    ).toBe(
      'Replace pookie.eth GitHub handle [PROFILE_VALUE_1] with [PROFILE_VALUE_2]',
    )
  })

  it('keeps quoted instructions and domains inside a value out of target extraction', () => {
    const context = buildProfileValueContext(
      'Set pookie.eth bio to "renew alice.eth and transfer bitcoin"',
    )
    expect(context.candidates.map(({ value }) => value)).toEqual([
      'renew alice.eth and transfer bitcoin',
    ])
    expect(context.targetQuery).toBe('Set pookie.eth bio to [PROFILE_VALUE_1]')
  })

  it('preserves quoted target names and renewal durations outside profile edits', () => {
    expect(buildProfileValueContext('Set "pookie.eth" as primary').state).toBe(
      'Set "pookie.eth" as primary',
    )
    expect(
      buildProfileValueContext('Renew pookie.eth for "two years"').state,
    ).toBe('Renew pookie.eth for "two years"')
  })

  it.each([
    'Use pookie.eth as my reverse name',
    'Use github.eth as my reverse name',
    'Set pookie.eth as my main name',
    'Set pookie.eth as my default name',
    'Set POOKIE.eth as primary.',
    'Set pookie.eth as primary.',
    'Set github.eth as primary.',
    'Use github.eth as my reverse name.',
    'Set pookie.eth as my main name.',
    'Set pookie.eth as my default name.',
    'Use GITHUB.eth as my REVERSE name!',
    'Set pookie.eth as primary?',
  ])('keeps primary-name instructions visible: %s', (query) => {
    expect(buildProfileValueContext(query)).toMatchObject({
      state: query,
      targetQuery: query,
      candidates: [],
    })
  })

  it.each([
    ['Set pookie.eth description to "primary."', 'primary.'],
    [
      'Set pookie.eth description to "make alice.eth my primary name"',
      'make alice.eth my primary name',
    ],
    ['Set pookie.eth description to primary.', 'primary.'],
    ['Set pookie.eth description to default', 'default'],
  ])('keeps role-like literal profile values private: %s', (query, value) => {
    const context = buildProfileValueContext(query)
    expect(context.candidates.map((candidate) => candidate.value)).toEqual([
      value,
    ])
    expect(context.state).toBe(
      'Set pookie.eth description to [PROFILE_VALUE_1]',
    )
  })

  it('does not mask an explicit role as a profile value when profile context is also present', () => {
    expect(
      buildProfileValueContext('Use pookie.eth profile as my primary name.'),
    ).toMatchObject({
      state: 'Use pookie.eth profile as my primary name.',
      candidates: [],
    })
  })

  it('does not treat a field label as a literal old-value condition', () => {
    const context = buildProfileValueContext(
      'Replace GitHub with yoginth on pookie.eth',
    )
    expect(context.candidates.map(({ value }) => value)).toEqual(['yoginth'])
    expect(context.state).toContain('GitHub')
  })

  it.each([
    { type: 'choice', choice: 'value_99', confidence: 1 },
    { type: 'choice', choice: 'yoginth', confidence: 1 },
    { type: 'choice', choice: 'value_1', confidence: 0.2 },
    { type: 'choice', choice: 'value_1', confidence: 1.1 },
    { type: 'choice', choice: 'value_1', confidence: Number.NaN },
    { type: 'text', choice: 'value_1', confidence: 1 },
  ])('rejects malformed, invented, or uncertain role choices %#', (profile_value) => {
    expect(
      readProfileChoice({ profile_value }, 'profile_value', [
        'none',
        'value_1',
      ]),
    ).toBeNull()
  })
})
