import { describe, expect, it, vi } from 'vitest'

// og-render imports workers-og, which loads a WASM module at import time that
// the node test environment can't resolve. Stub it — escapeHtml is pure.
vi.mock('workers-og', () => ({ ImageResponse: class {} }))

const { escapeHtml } = await import('./og-render')

describe('escapeHtml', () => {
  it('escapes the five HTML-sensitive characters plus slash', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
    expect(escapeHtml("'")).toBe('&#39;')
    expect(escapeHtml('/')).toBe('&#x2F;')
  })

  it('neutralizes a single-quote attribute breakout', () => {
    expect(escapeHtml("vitalik' onerror='alert(1)")).toBe(
      'vitalik&#39; onerror=&#39;alert(1)',
    )
  })

  it('does not double-escape ampersands in its own output', () => {
    // & is replaced first, so the &# entities it emits are not re-escaped
    expect(escapeHtml('/')).not.toContain('&amp;')
    expect(escapeHtml('a&b')).toBe('a&amp;b')
  })

  it('round-trips an avatar URL through HTML entity decoding', () => {
    const url = 'https://example.com/avatar.png?x=1&y=2'
    const escaped = escapeHtml(url)
    // mimic what an HTML parser (browser / workers-og) does on read-back
    const decoded = escaped
      .replace(/&#x2F;/g, '/')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&')
    expect(decoded).toBe(url)
  })
})
