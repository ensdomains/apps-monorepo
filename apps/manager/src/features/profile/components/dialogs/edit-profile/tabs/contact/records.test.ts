import { describe, expect, it, vi } from 'vitest'
import { contactMethods, defaultEnabledContactMethodKeys } from './constants'
import * as contactRecordHelpers from './records'
import {
  getBaseWithPrimarySocialContactKeys,
  getContactMethodErrorMessage,
  getContactMethodNoticeMessage,
  getContactValidationIssues,
  getIsPrimaryContactToggleDisabled,
  getPrimarySocialContactKeys,
  parsePrimaryContactKeys,
} from './records'

describe('contact record helpers', () => {
  const getContactMethod = (key: string) => {
    const method = contactMethods.find(
      (contactMethod) => contactMethod.key === key,
    )

    if (!method) {
      throw new Error(`Unknown contact method key: ${key}`)
    }

    return method
  }

  describe('parsePrimaryContactKeys', () => {
    it('keeps the first three distinct supported keys in order', () => {
      expect(
        parsePrimaryContactKeys({
          'domains.ens.primary-contacts': JSON.stringify([
            null,
            1,
            true,
            { key: 'phone' },
            ['phone'],
            'unsupported',
            'com.github',
            'com.github',
            'email',
            'com.twitter',
            'phone',
          ]),
        }),
      ).toEqual(['com.github', 'email', 'com.twitter'])
    })

    it('does not scan past the first 64 array elements', () => {
      expect(
        parsePrimaryContactKeys({
          'domains.ens.primary-contacts': JSON.stringify([
            ...Array(64).fill('email'),
            'com.github',
            'phone',
          ]),
        }),
      ).toEqual(['email'])
    })

    it('includes supported keys at the element limit', () => {
      expect(
        parsePrimaryContactKeys({
          'domains.ens.primary-contacts': JSON.stringify([
            ...Array(62).fill('email'),
            'com.github',
            'phone',
          ]),
        }),
      ).toEqual(['email', 'com.github', 'phone'])
    })

    it('accepts 4 KiB and uses the single-contact fallback one byte over it', () => {
      const value = '["email"]'.padEnd(4 * 1024, ' ')

      expect(
        parsePrimaryContactKeys({ 'domains.ens.primary-contacts': value }),
      ).toEqual(['email'])
      expect(
        parsePrimaryContactKeys({
          'domains.ens.primary-contacts': `${value} `,
          'primary-contact': 'phone',
        }),
      ).toEqual(['phone'])
    })

    it('enforces the UTF-8 byte limit before parsing', () => {
      const value = JSON.stringify(['email', 'é'.repeat(2042)])

      expect(new TextEncoder().encode(value)).toHaveLength(4 * 1024)
      expect(
        parsePrimaryContactKeys({ 'domains.ens.primary-contacts': value }),
      ).toEqual(['email'])
      expect(
        parsePrimaryContactKeys({
          'domains.ens.primary-contacts': `${value} `,
          'primary-contact': 'phone',
        }),
      ).toEqual(['phone'])
    })

    it.each([
      '["email"]'.padStart(4 * 1024 + 1, ' '),
      '{"key":"email"}',
      '"email"',
      'null',
      '42',
    ])('rejects oversized or non-array input before JSON parsing', (value) => {
      const parse = vi.spyOn(JSON, 'parse')
      try {
        expect(
          parsePrimaryContactKeys({
            'domains.ens.primary-contacts': value,
            'primary-contact': ' com.github ',
          }),
        ).toEqual(['com.github'])
        expect(parse).not.toHaveBeenCalled()
      } finally {
        parse.mockRestore()
      }
    })

    it('rejects a grouped 270,000-key payload within the processing budget', () => {
      const value = JSON.stringify([
        ...Array(90_000).fill('email'),
        ...Array(90_000).fill('mail'),
        ...Array(90_000).fill('phone'),
      ])
      const start = performance.now()
      const result = parsePrimaryContactKeys({
        'domains.ens.primary-contacts': value,
      })
      const elapsed = performance.now() - start

      expect(result).toEqual([])
      // Allow slow CI workers while catching the reported multi-second stall.
      expect(elapsed).toBeLessThan(1000)
    })

    it.each([
      '[invalid]',
      'not-json',
      '',
    ])('uses the single-contact fallback for malformed JSON', (value) => {
      expect(
        parsePrimaryContactKeys({
          'domains.ens.primary-contacts': value,
          'primary-contact': ' com.github ',
        }),
      ).toEqual(['com.github'])
    })

    it.each([
      '[]',
      '[null,1,"unsupported"]',
    ])('keeps a valid array authoritative over the single-contact fallback', (value) => {
      expect(
        parsePrimaryContactKeys({
          'domains.ens.primary-contacts': value,
          'primary-contact': 'com.github',
        }),
      ).toEqual([])
    })
  })

  describe('defaultEnabledContactMethodKeys', () => {
    it('preselects only X and Telegram by default', () => {
      expect([...defaultEnabledContactMethodKeys]).toEqual([
        'com.twitter',
        'org.telegram',
      ])
    })
  })

  describe('contact error message presentation', () => {
    it('uses the 12px warning icon treatment from the edit profile design', () => {
      expect(contactRecordHelpers.contactErrorMessageIconSymbol).toBe('warning')
      expect(contactRecordHelpers.contactErrorMessageClassName).toContain(
        'text-xs',
      )
      expect(contactRecordHelpers.contactErrorMessageClassName).toContain(
        'text-ens-signal-danger-600',
      )
    })
  })

  describe('getContactMethodNoticeMessage', () => {
    it('shows the public profile visibility notice for email, address, and phone', () => {
      expect(
        ['email', 'mail', 'phone'].map((key) =>
          getContactMethodNoticeMessage(getContactMethod(key)),
        ),
      ).toEqual([
        'Your contact information is publicly viewable on your profile.',
        'Your contact information is publicly viewable on your profile.',
        'Your contact information is publicly viewable on your profile.',
      ])
    })

    it('does not show the public profile visibility notice for social methods', () => {
      expect(
        getContactMethodNoticeMessage(getContactMethod('com.twitter')),
      ).toBeUndefined()
    })
  })

  describe('getIsPrimaryContactToggleDisabled', () => {
    it('keeps unselected empty contact methods enabled while there are primary slots available', () => {
      expect(
        getIsPrimaryContactToggleDisabled({
          isPrimary: false,
          primaryContactCount: 0,
        }),
      ).toBe(false)
    })

    it('disables unselected contact methods when every primary slot is already used', () => {
      expect(
        getIsPrimaryContactToggleDisabled({
          isPrimary: false,
          primaryContactCount: 3,
        }),
      ).toBe(true)
    })

    it('keeps featured socials enabled so they can be unstarred', () => {
      expect(
        getIsPrimaryContactToggleDisabled({
          isPrimary: true,
          primaryContactCount: 3,
        }),
      ).toBe(false)
    })
  })

  describe('featured social error message', () => {
    it('requires a value when a social method is featured', () => {
      expect(
        getContactMethodErrorMessage({
          isPrimary: true,
          method: getContactMethod('com.twitter'),
          value: '',
        }),
      ).toBe('Add Twitter before featuring it on your profile.')
    })

    it('does not return an error for an unstarred empty social method', () => {
      expect(
        getContactMethodErrorMessage({
          isPrimary: false,
          method: getContactMethod('com.twitter'),
          value: '',
        }),
      ).toBeUndefined()
    })

    it('does not return an error for featured social methods with a value', () => {
      expect(
        getContactMethodErrorMessage({
          isPrimary: true,
          method: getContactMethod('com.twitter'),
          value: 'ens',
        }),
      ).toBeUndefined()
    })
  })

  describe('getContactMethodErrorMessage', () => {
    it('returns an invalid email error for malformed email contact values', () => {
      expect(
        getContactMethodErrorMessage({
          isPrimary: true,
          method: {
            key: 'email',
            label: 'E-mail',
            placeholder: 'myemail@me.com',
            section: 'contact',
            type: 'email',
          },
          value: 'd',
        }),
      ).toBe('Enter a valid email address')
    })

    it('does not validate empty unpinned email contact values', () => {
      expect(
        getContactMethodErrorMessage({
          isPrimary: false,
          method: {
            key: 'email',
            label: 'E-mail',
            placeholder: 'myemail@me.com',
            section: 'contact',
            type: 'email',
          },
          value: '',
        }),
      ).toBeUndefined()
    })
  })

  describe('featured social validation', () => {
    it('preserves non-social primary contacts when featured socials change', () => {
      expect(
        getBaseWithPrimarySocialContactKeys(
          {
            'domains.ens.primary-contacts': JSON.stringify([
              'email',
              'com.twitter',
            ]),
            'primary-contact': 'email',
          },
          ['com.github'],
        ),
      ).toEqual({
        'domains.ens.primary-contacts': JSON.stringify(['email', 'com.github']),
        'primary-contact': 'email',
      })
    })

    it('treats only social methods as star-selectable contact methods', () => {
      expect(
        getPrimarySocialContactKeys({
          'domains.ens.primary-contacts': JSON.stringify([
            'email',
            'com.twitter',
            'com.github',
          ]),
        }),
      ).toEqual(['com.twitter', 'com.github'])
    })

    it('returns validation issues for empty featured social methods', () => {
      expect(
        getContactValidationIssues({
          addresses: [],
          base: {
            'domains.ens.primary-contacts': JSON.stringify([
              'com.twitter',
              'email',
            ]),
            'primary-contact': 'com.twitter',
          },
          contact: [{ key: 'email', value: 'test@example.com' }],
          links: [],
          social: [{ key: 'com.twitter', value: '' }],
          unknown: [],
          agentRegistrations: [],
        }),
      ).toEqual([
        {
          key: 'com.twitter',
          message: 'Add Twitter before featuring it on your profile.',
        },
      ])
    })

    it('returns no validation issues when every pinned primary contact has a value', () => {
      expect(
        getContactValidationIssues({
          addresses: [],
          base: {
            'domains.ens.primary-contacts': JSON.stringify(['com.twitter']),
            'primary-contact': 'com.twitter',
          },
          contact: [],
          links: [],
          social: [{ key: 'com.twitter', value: 'ens' }],
          unknown: [],
          agentRegistrations: [],
        }),
      ).toEqual([])
    })
  })

  describe('getContactValidationIssues', () => {
    it('returns validation issues for malformed email contact values', () => {
      expect(
        getContactValidationIssues({
          addresses: [],
          base: {},
          contact: [{ key: 'email', value: 'd' }],
          links: [],
          social: [],
          unknown: [],
          agentRegistrations: [],
        }),
      ).toEqual([{ key: 'email', message: 'Enter a valid email address' }])
    })
  })
})
