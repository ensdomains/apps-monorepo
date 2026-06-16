import { describe, expect, it, vi } from 'vitest'

// og-render imports workers-og, which loads a WASM module at import time that
// the node test environment can't resolve. Stub it — escapeHtml is pure.
vi.mock('workers-og', () => ({ ImageResponse: class {} }))

const { escapeHtml } = await import('./og-render')

describe('escapeHtml', () => {
  it('escapes the five HTML-sensitive characters', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
    expect(escapeHtml("'")).toBe('&#39;')
  })

  it('neutralizes a single-quote attribute breakout', () => {
    expect(escapeHtml("vitalik' onerror='alert(1)")).toBe(
      'vitalik&#39; onerror=&#39;alert(1)',
    )
  })

  it('does not double-escape ampersands in its own output', () => {
    // & is replaced first, so the &# entities it emits are not re-escaped
    expect(escapeHtml('a&b')).toBe('a&amp;b')
    expect(escapeHtml("'")).toBe('&#39;')
  })

  it('leaves slashes untouched so base64 data: URIs survive intact', () => {
    const url = 'data:image/png;base64,iVBOR/w0KGgo+AAAA=='
    expect(escapeHtml(url)).toBe(url)
  })
})
