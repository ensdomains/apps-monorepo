import { describe, expect, it } from 'vitest'
import { humanizeType } from './descriptors'

describe('humanizeType', () => {
  it('sentence-cases camel-cased event types', () => {
    expect(humanizeType('NameRegistered')).toBe('Name registered')
    expect(humanizeType('SubregistryUpdated')).toBe('Subregistry updated')
    expect(humanizeType('AddrChanged')).toBe('Addr changed')
  })

  it('preserves acronyms', () => {
    expect(humanizeType('EACRolesChanged')).toBe('EAC roles changed')
  })
})
