import { describe, expect, it } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import {
  checkProfileEditProposal,
  getProfileEditProposalCurrentValue,
  normalizeGitHubUsername,
} from './profileRecordProposal'

describe('GitHub username proposals', () => {
  it.each([
    ['yoginth', 'yoginth'],
    [' @Yoginth ', 'Yoginth'],
    ['https://github.com/yoginth', 'yoginth'],
    ['https://www.github.com/yoginth/', 'yoginth'],
    ['github.com/yoginth?tab=repositories', 'yoginth'],
    ['https://github.com/%79oginth', 'yoginth'],
    ['a-b', 'a-b'],
    ['a'.repeat(39), 'a'.repeat(39)],
  ])('normalizes %s to its username', (input, expected) => {
    expect(normalizeGitHubUsername(input)).toBe(expected)
  })

  it.each([
    '',
    '@@yoginth',
    '-yoginth',
    'yoginth-',
    'yo--ginth',
    'yo_ginth',
    'a'.repeat(40),
    'https://github.com/yoginth/website',
    'https://github.com/',
    'https://github.com/yoginth//',
    'https://github.com.evil.example/yoginth',
    'https://api.github.com/yoginth',
    'https://github.com@evil.example/yoginth',
    'https://user:password@github.com/yoginth',
    'https://github.com:8443/yoginth',
    'javascript:alert(1)',
    'https://github.com/%2Fyoginth',
    'https://github.com/%40%40yoginth',
    'https://github.com/%zz',
    'yoginth instead of bigint',
  ])('rejects invalid or ambiguous value %s', (input) => {
    expect(normalizeGitHubUsername(input)).toBeNull()
  })
})

describe('profile replacement guard', () => {
  it('reads the GitHub contact record separately from generic profile links', () => {
    const records = {
      ...newEmptyProfileRecords(),
      social: [{ key: 'com.github', value: 'bigint' }],
      links: [{ name: 'GitHub', url: 'https://github.com/someone-else' }],
    }
    expect(getProfileEditProposalCurrentValue(records, 'github')).toBe('bigint')
    expect(
      checkProfileEditProposal(records, {
        field: 'github',
        value: 'yoginth',
        expectedValue: 'https://github.com/BigInt',
      }),
    ).toBeNull()
    expect(records.social).toEqual([{ key: 'com.github', value: 'bigint' }])
  })

  it('allows an unconditional proposal without claiming a current value', () => {
    expect(
      checkProfileEditProposal(newEmptyProfileRecords(), {
        field: 'github',
        value: 'yoginth',
      }),
    ).toBeNull()
  })

  it('explains a missing or mismatched GitHub record instead of replacing it', () => {
    const proposal = {
      field: 'github' as const,
      value: 'yoginth',
      expectedValue: 'bigint',
    }
    expect(checkProfileEditProposal(newEmptyProfileRecords(), proposal)).toBe(
      'The current GitHub username is not set. Your request expected “bigint”. Review the current value before replacing it.',
    )
    expect(
      checkProfileEditProposal(
        {
          ...newEmptyProfileRecords(),
          social: [{ key: 'com.github', value: 'other-user' }],
        },
        proposal,
      ),
    ).toBe(
      'The current GitHub username is “other-user”. Your request expected “bigint”. Review the current value before replacing it.',
    )
  })

  it('does not equate two invalid GitHub values', () => {
    expect(
      checkProfileEditProposal(
        {
          ...newEmptyProfileRecords(),
          social: [{ key: 'com.github', value: 'invalid_value' }],
        },
        {
          field: 'github',
          value: 'yoginth',
          expectedValue: 'invalid_value',
        },
      ),
    ).not.toBeNull()
  })

  it('compares ETH address casing and theme aliases using existing rules', () => {
    const records = {
      ...newEmptyProfileRecords(),
      addresses: [
        { coinType: 60, value: '0x000000000000000000000000000000000000dEaD' },
      ],
      base: { theme: '#0080bc' },
    }
    expect(
      checkProfileEditProposal(records, {
        field: 'eth_address',
        value: '0x000000000000000000000000000000000000bEEF',
        expectedValue: '0x000000000000000000000000000000000000dead',
      }),
    ).toBeNull()
    for (const expectedValue of ['Lapis', '#0082BB', '#0080BC']) {
      expect(
        checkProfileEditProposal(records, {
          field: 'theme',
          value: '#E72A96',
          expectedValue,
        }),
      ).toBeNull()
    }
  })

  it('does not treat a missing or invalid theme as the default Lapis', () => {
    for (const theme of [undefined, '', 'invalid']) {
      expect(
        checkProfileEditProposal(
          { ...newEmptyProfileRecords(), base: { theme } },
          { field: 'theme', value: '#E72A96', expectedValue: '#0082BB' },
        ),
      ).not.toBeNull()
    }
  })

  it('requires exact matches for descriptions, email and avatar', () => {
    const records = {
      ...newEmptyProfileRecords(),
      base: { description: 'Hello', avatar: 'https://example.com/Avatar.png' },
      contact: [{ key: 'email', value: 'Me@example.com' }],
    }
    for (const [field, expectedValue] of [
      ['description', 'Hello'],
      ['avatar', 'https://example.com/Avatar.png'],
      ['email', 'Me@example.com'],
    ] as const) {
      expect(
        checkProfileEditProposal(records, {
          field,
          value: 'next',
          expectedValue,
        }),
      ).toBeNull()
      expect(
        checkProfileEditProposal(records, {
          field,
          value: 'next',
          expectedValue: expectedValue.toLowerCase(),
        }),
      ).not.toBeNull()
    }
  })
})
