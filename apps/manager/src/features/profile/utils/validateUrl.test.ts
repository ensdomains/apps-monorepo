import { i18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { validateEmail, validateUrl } from './validateUrl'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const urlMessage = (value: string | undefined) => {
  const message = validateUrl(value)
  return message ? i18n._(message) : undefined
}

describe('validateUrl', () => {
  it('should return undefined for empty values', () => {
    expect(urlMessage(undefined)).toBeUndefined()
    expect(urlMessage('')).toBeUndefined()
    expect(urlMessage('  ')).toBeUndefined()
  })

  it('should accept valid https URLs', () => {
    expect(urlMessage('https://example.com')).toBeUndefined()
    expect(urlMessage('https://ens.domains/about')).toBeUndefined()
    expect(urlMessage('https://sub.domain.co.uk/path?q=1')).toBeUndefined()
  })

  it('should accept valid http URLs', () => {
    expect(urlMessage('http://example.com')).toBeUndefined()
  })

  it('should accept bare domains by normalizing to https', () => {
    expect(urlMessage('example.com')).toBeUndefined()
    expect(urlMessage('www.example.com')).toBeUndefined()
  })

  it('should reject non-http URL schemes', () => {
    expect(urlMessage('javascript:alert(1)')).toBe(
      'Only http:// and https:// links are supported',
    )
    expect(urlMessage('data:text/html,<script>alert(1)</script>')).toBe(
      'Only http:// and https:// links are supported',
    )
    expect(urlMessage('vbscript:msgbox("xss")')).toBe(
      'Only http:// and https:// links are supported',
    )
    expect(urlMessage('file:///etc/passwd')).toBe(
      'Only http:// and https:// links are supported',
    )
  })

  it('should reject random text without a domain extension', () => {
    expect(urlMessage('hello')).toBe('Add a domain extension, like .com')
  })

  it('should reject URLs with spaces', () => {
    expect(urlMessage('not a url')).toBe(
      "Links can't contain spaces. Remove them and try again",
    )
  })

  it('should treat the prefilled https:// as empty', () => {
    expect(urlMessage('https://')).toBeUndefined()
  })

  it('should reject malformed URLs', () => {
    expect(urlMessage('://')).toBe(
      'Enter a valid URL, like https://example.com',
    )
  })
})

describe('validateEmail', () => {
  it('should return undefined for empty values', () => {
    expect(validateEmail(undefined)).toBeUndefined()
    expect(validateEmail('')).toBeUndefined()
    expect(validateEmail('  ')).toBeUndefined()
  })

  it('should accept valid email addresses', () => {
    expect(validateEmail('user@example.com')).toBeUndefined()
    expect(validateEmail('name@ens.domains')).toBeUndefined()
    expect(validateEmail('first.last@sub.domain.com')).toBeUndefined()
  })

  it('should reject emails without @', () => {
    expect(validateEmail('userexample.com')).toBeDefined()
  })

  it('should reject emails without domain', () => {
    expect(validateEmail('user@')).toBeDefined()
  })

  it('should reject random text', () => {
    expect(validateEmail('not-an-email')).toBeDefined()
    expect(validateEmail('hello world')).toBeDefined()
  })
})
