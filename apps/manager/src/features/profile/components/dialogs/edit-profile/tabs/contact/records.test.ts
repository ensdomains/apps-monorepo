import { describe, expect, it } from 'vitest'
import {
  getContactMethodErrorMessage,
  getContactValidationIssues,
  getIsPrimaryContactToggleDisabled,
  getPrimaryContactErrorMessage,
  getPrimaryContactValidationIssues,
} from './records'

describe('contact record helpers', () => {
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

    it('keeps selected contact methods enabled so they can be unpinned', () => {
      expect(
        getIsPrimaryContactToggleDisabled({
          isPrimary: true,
          primaryContactCount: 3,
        }),
      ).toBe(false)
    })
  })

  describe('getPrimaryContactErrorMessage', () => {
    it('requires a value when a contact method is pinned as primary', () => {
      expect(
        getPrimaryContactErrorMessage({
          isPrimary: true,
          label: 'Twitter',
          value: '',
        }),
      ).toBe('Add Twitter before pinning it as a primary contact method.')
    })

    it('does not return an error for unpinned empty contact methods', () => {
      expect(
        getPrimaryContactErrorMessage({
          isPrimary: false,
          label: 'Twitter',
          value: '',
        }),
      ).toBeUndefined()
    })

    it('does not return an error for pinned contact methods with a value', () => {
      expect(
        getPrimaryContactErrorMessage({
          isPrimary: true,
          label: 'Twitter',
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

  describe('getPrimaryContactValidationIssues', () => {
    it('returns validation issues for pinned empty primary contact methods', () => {
      expect(
        getPrimaryContactValidationIssues({
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
        }),
      ).toEqual([
        {
          key: 'com.twitter',
          message: 'Add Twitter before pinning it as a primary contact method.',
        },
      ])
    })

    it('returns no validation issues when every pinned primary contact has a value', () => {
      expect(
        getPrimaryContactValidationIssues({
          addresses: [],
          base: {
            'domains.ens.primary-contacts': JSON.stringify(['com.twitter']),
            'primary-contact': 'com.twitter',
          },
          contact: [],
          links: [],
          social: [{ key: 'com.twitter', value: 'ens' }],
          unknown: [],
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
        }),
      ).toEqual([{ key: 'email', message: 'Enter a valid email address' }])
    })
  })
})
