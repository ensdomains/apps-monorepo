import { describe, expect, it } from 'vitest'
import { isRequestPathTooLong } from './requestPath'

describe('isRequestPathTooLong', () => {
  it('lets through the longest path the server will route', () => {
    expect(isRequestPathTooLong(`/${'a'.repeat(2043)}.eth`)).toBe(false)
  })

  it('refuses a path one character longer', () => {
    expect(isRequestPathTooLong(`/${'a'.repeat(2044)}.eth`)).toBe(true)
  })

  it('counts the encoded path, so a name of combining marks is bounded too', () => {
    const marks = encodeURIComponent('ّ'.repeat(200) + 'ً'.repeat(200))
    expect(isRequestPathTooLong(`/register/a${marks}.eth`)).toBe(true)
  })
})
