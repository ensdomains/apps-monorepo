import { describe, expect, it, vi } from 'vitest'

// og-render imports workers-og, which loads a WASM module at import time that
// the node test environment can't resolve. Stub it — escapeHtml is pure.
vi.mock('workers-og', () => ({ ImageResponse: class {} }))

const { escapeHtml, resolverSubtitle, resolverPageLabel, registryPageLabel } =
  await import('./og-render')

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

describe('resolverSubtitle', () => {
  it('labels permissioned resolvers', () => {
    expect(resolverSubtitle(true)).toBe('Permissioned Resolver')
  })

  it('labels plain resolvers', () => {
    expect(resolverSubtitle(false)).toBe('Resolver')
  })
})

describe('resolverPageLabel', () => {
  it('defaults to the overview label', () => {
    expect(resolverPageLabel(null)).toBe('Resolver Overview')
  })

  it('maps known subpages', () => {
    expect(resolverPageLabel('roles')).toBe('Roles')
    expect(resolverPageLabel('nodes')).toBe('Nodes')
    expect(resolverPageLabel('aliases')).toBe('Aliases')
    expect(resolverPageLabel('create-alias')).toBe('Create Alias')
    expect(resolverPageLabel('history')).toBe('History')
  })

  it('title-cases unknown subpages', () => {
    expect(resolverPageLabel('something')).toBe('Something')
  })
})

describe('registryPageLabel', () => {
  it('defaults to the overview label', () => {
    expect(registryPageLabel(null)).toBe('Registry Overview')
  })

  it('maps known subpages', () => {
    expect(registryPageLabel('labels')).toBe('Labels')
    expect(registryPageLabel('roles')).toBe('Roles')
    expect(registryPageLabel('history')).toBe('History')
  })
})
