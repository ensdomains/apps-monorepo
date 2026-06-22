import { describe, expect, it } from 'vitest'
import type { ProfileRecords } from '@/features/profile/types'
import {
  generalShortcuts,
  getDefaultVisibleFields,
  removeGeneralFieldValue,
} from './fields'

const createRecords = (base: ProfileRecords['base'] = {}): ProfileRecords => ({
  base,
  contact: [],
  social: [],
  addresses: [],
  links: [],
  unknown: [],
})

describe('general profile fields', () => {
  it('includes full name as an unselected shortcut by default', () => {
    const fields = generalShortcuts.map(({ field }) => field)

    expect(fields).toContain('name')
    expect(generalShortcuts.find(({ field }) => field === 'name')?.label).toBe(
      'Full name',
    )
    expect(
      getDefaultVisibleFields(createRecords({ name: 'Yoginth' })),
    ).not.toContain('name')
  })

  it.each([
    ['avatar', 'base'],
    ['header', 'base'],
    ['url', 'base'],
    ['description', 'base'],
    ['name', 'base'],
    ['language', 'base'],
    ['location', 'contact'],
    ['timezone', 'contact'],
  ] as const)('removes the %s record value when toggled off', (field, section) => {
    const records = {
      ...createRecords({
        avatar: 'https://example.com/avatar.png',
        description: 'Bio',
        header: 'https://example.com/banner.png',
        language: 'en',
        name: 'Yoginth',
        url: 'https://example.com',
      }),
      contact: [
        { key: 'location', value: 'Bengaluru' },
        { key: 'timezone', value: 'UTC+5' },
      ],
    }

    const result = removeGeneralFieldValue(records, field)

    if (section === 'base') {
      expect(result.base[field]).toBeUndefined()
      return
    }

    expect(result.contact.some((record) => record.key === field)).toBe(false)
  })
})
