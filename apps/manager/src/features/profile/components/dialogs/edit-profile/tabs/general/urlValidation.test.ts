import { i18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { getGeneralUrlErrorMessage } from './fields'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const message = (value: string | undefined) => {
  const descriptor = getGeneralUrlErrorMessage(value)
  return descriptor ? i18n._(descriptor) : undefined
}

describe('general URL validation', () => {
  it('validates custom link URL values', () => {
    expect(message('')).toBeUndefined()
    expect(message('https://example.com')).toBeUndefined()
    expect(message('www.example.com')).toBeUndefined()
    expect(message('hello')).toBe('Add a domain extension, like .com')
  })

  it('rejects typed text containing spaces after the prefilled https://', () => {
    expect(message('https://my website')).toBe(
      "Links can't contain spaces. Remove them and try again",
    )
    expect(message('https://example.com/a b')).toBe(
      "Links can't contain spaces. Remove them and try again",
    )
  })

  it('does not flag the https:// prefilled on focus', () => {
    expect(message('https://')).toBeUndefined()
  })
})
