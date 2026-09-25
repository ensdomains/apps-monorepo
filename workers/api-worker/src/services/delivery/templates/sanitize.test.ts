import { describe, expect, it } from 'vitest'
import {
  encodeNamePathSegment,
  escapeHtml,
  normalizeNotificationName,
} from './sanitize.js'

describe('notification output sanitization', () => {
  it('strips control characters without rejecting punctuation', () => {
    expect(normalizeNotificationName(' ali\nce+test.eth\t ')).toBe(
      'alice+test.eth',
    )
  })

  it('escapes HTML-sensitive characters', () => {
    expect(escapeHtml(`<b title="x">'&`)).toBe(
      '&lt;b title=&quot;x&quot;&gt;&#39;&amp;',
    )
  })

  it('encodes reserved path characters', () => {
    expect(encodeNamePathSegment('../foo bar.eth')).toBe('..%2Ffoo%20bar.eth')
  })
})
