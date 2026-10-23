import { assert, describe, expect, it } from 'vitest'
import { normalizeUrlInput } from './urlInputPrefix'
import { type UrlInputIssue, validateUrlInput } from './urlInputValidation'

const getIssue = (value: string): UrlInputIssue | undefined => {
  const result = validateUrlInput(value)
  return result.isErr() ? result.error.reason : undefined
}

describe('normalizeUrlInput', () => {
  it('adds https:// to bare domains', () => {
    expect(normalizeUrlInput('asdfdf4t4.com')).toBe('https://asdfdf4t4.com')
  })

  it('keeps the path, query and fragment', () => {
    expect(normalizeUrlInput('ens.domains/blog?tag=dev#latest')).toBe(
      'https://ens.domains/blog?tag=dev#latest',
    )
  })

  it('treats a port as part of the domain', () => {
    expect(normalizeUrlInput('example.com:8443/path')).toBe(
      'https://example.com:8443/path',
    )
  })

  it('keeps an explicit scheme without duplicating it', () => {
    expect(normalizeUrlInput('http://ens.domains')).toBe('http://ens.domains')
    expect(normalizeUrlInput('https://ens.domains')).toBe('https://ens.domains')
    expect(normalizeUrlInput('HTTPS://ens.domains')).toBe('HTTPS://ens.domains')
    expect(normalizeUrlInput('javascript:alert(1)')).toBe('javascript:alert(1)')
  })

  it('trims whitespace', () => {
    expect(normalizeUrlInput('  ens.domains  ')).toBe('https://ens.domains')
  })

  it('treats empty input and the prefilled https:// as empty', () => {
    expect(normalizeUrlInput('   ')).toBe('')
    expect(normalizeUrlInput('https://')).toBe('')
  })
})

describe('validateUrlInput', () => {
  it('returns the normalized URL for valid input', () => {
    const bareDomain = validateUrlInput('asdfdf4t4.com')
    assert(bareDomain.isOk())
    expect(bareDomain.value).toBe('https://asdfdf4t4.com')

    const withParts = validateUrlInput(' http://ens.domains/a?b=1#c ')
    assert(withParts.isOk())
    expect(withParts.value).toBe('http://ens.domains/a?b=1#c')

    const uppercaseScheme = validateUrlInput('HTTPS://ENS.DOMAINS')
    assert(uppercaseScheme.isOk())
    expect(uppercaseScheme.value).toBe('HTTPS://ENS.DOMAINS')
  })

  it('rejects spaces', () => {
    expect(getIssue('my site.com')).toBe('has-spaces')
    expect(getIssue('https://example.com/a b')).toBe('has-spaces')
  })

  it('rejects domains without an extension', () => {
    expect(getIssue('hello')).toBe('missing-domain-extension')
    expect(getIssue('https://hello')).toBe('missing-domain-extension')
    expect(getIssue('localhost:3000')).toBe('missing-domain-extension')
    expect(getIssue('example.')).toBe('missing-domain-extension')
  })

  it('rejects schemes other than http and https', () => {
    expect(getIssue('javascript:alert(1)')).toBe('unsupported-scheme')
    expect(getIssue('JavaScript:alert(1)')).toBe('unsupported-scheme')
    expect(getIssue('data:text/html,hi')).toBe('unsupported-scheme')
    expect(getIssue('ftp://example.com')).toBe('unsupported-scheme')
    expect(getIssue('mailto:hi@example.com')).toBe('unsupported-scheme')
  })

  it('rejects input that is not a URL', () => {
    expect(getIssue('http://')).toBe('invalid-url')
    expect(getIssue('exa<mple.com')).toBe('invalid-url')
  })
})
