import { describe, expect, it } from 'vitest'
import type { ProfileRecords } from '@/features/profile/types'
import { generalShortcuts, getDefaultVisibleFields } from './fields'

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
    expect(fields.indexOf('name')).toBeLessThan(fields.indexOf('description'))
    expect(generalShortcuts.find(({ field }) => field === 'name')?.label).toBe(
      'Full name',
    )
    expect(
      getDefaultVisibleFields(createRecords({ name: 'Yoginth' })),
    ).not.toContain('name')
  })
})
