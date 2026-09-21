import { describe, expect, it } from 'vitest'
import { collapseMarkup, escapeHtml } from './markup'

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
    // a combined input confirms neither replacement double-escapes the
    // other's output — notably the & inside the &#39; emitted for '
    expect(escapeHtml("a&'b")).toBe('a&amp;&#39;b')
  })

  it('leaves slashes untouched so base64 data: URIs survive intact', () => {
    const url = 'data:image/png;base64,iVBOR/w0KGgo+AAAA=='
    expect(escapeHtml(url)).toBe(url)
  })
})

describe('collapseMarkup', () => {
  it('drops the whitespace satori would keep as a flex child', () => {
    expect(
      collapseMarkup(`
        <div style="display: flex; gap: 48px;">
          <img src="a.svg" />
          <div>ENS App</div>
        </div>`),
    ).toBe(
      '<div style="display: flex; gap: 48px;"><img src="a.svg" /><div>ENS App</div></div>',
    )
  })

  it('keeps the whitespace inside text', () => {
    expect(collapseMarkup('<div>Available to register</div>')).toBe(
      '<div>Available to register</div>',
    )
  })

  it('leaves whitespace between a tag and adjacent text alone', () => {
    expect(collapseMarkup('<div>ENS <b>App</b></div>')).toBe(
      '<div>ENS <b>App</b></div>',
    )
  })
})
