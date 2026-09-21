import { describe, expect, it } from 'vitest'
import {
  encodeNamePathSegment,
  escapeHtml,
  normalizeNotificationName,
} from './sanitize.js'

describe('notification name sanitization', () => {
  it('strips control characters from display names', () => {
    expect(normalizeNotificationName('ali\nce.eth')).toBe('alice.eth')
    expect(normalizeNotificationName('  alice.eth  ')).toBe('alice.eth')
  })

  it('HTML-escapes the five markup-sensitive characters', () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)> & "'`)).toBe(
      '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;&#39;',
    )
  })

  it('encodes path traversal and reserved URL characters', () => {
    expect(encodeNamePathSegment('../alice.eth')).toBe('..%2Falice.eth')
    expect(encodeNamePathSegment('foo bar.eth')).toBe('foo%20bar.eth')
  })
})
