import { describe, expect, it } from 'vitest'
import { getRendererSandbox } from './rendererSandbox'

const trustedRendererOrigin = 'https://renderer.example'
const defaults = {
  rendererUrl: `${trustedRendererOrigin}/?tokenId=1&transparent=1`,
  appOrigin: 'https://app.example',
  trustedRendererOrigin,
}

describe('getRendererSandbox', () => {
  it('preserves the trusted HTTPS renderer origin for asset requests', () => {
    expect(getRendererSandbox(defaults)).toBe('allow-scripts allow-same-origin')
  })

  it('supports a local development app with a separate trusted renderer', () => {
    expect(
      getRendererSandbox({ ...defaults, appOrigin: 'http://localhost:5173' }),
    ).toBe('allow-scripts allow-same-origin')
  })

  it.each([
    { rendererUrl: undefined },
    { rendererUrl: '' },
    { rendererUrl: '/renderer' },
    { rendererUrl: 'https://' },
    { appOrigin: undefined },
    { appOrigin: '' },
    { appOrigin: 'null' },
    { appOrigin: 'https://' },
    { trustedRendererOrigin: '' },
    { trustedRendererOrigin: 'https://' },
  ])('keeps missing or malformed origins isolated: %j', (overrides) => {
    expect(getRendererSandbox({ ...defaults, ...overrides })).toBe(
      'allow-scripts',
    )
  })

  it.each([
    'https://other.example/',
    'https://preview.renderer.example/',
    'https://renderer.example:8443/',
  ])('does not trust a different renderer origin: %s', (rendererUrl) => {
    expect(getRendererSandbox({ ...defaults, rendererUrl })).toBe(
      'allow-scripts',
    )
  })

  it.each([
    trustedRendererOrigin,
    'https://RENDERER.example:443/',
  ])('keeps a renderer on the app origin isolated: %s', (appOrigin) => {
    expect(getRendererSandbox({ ...defaults, appOrigin })).toBe('allow-scripts')
  })

  it.each([
    {
      rendererUrl: 'http://renderer.example/',
      trustedRendererOrigin: 'http://renderer.example',
    },
    { rendererUrl: 'data:text/plain,renderer' },
    { rendererUrl: 'blob:https://renderer.example/preview' },
    { trustedRendererOrigin: 'blob:https://renderer.example/preview' },
    { appOrigin: 'file:///preview.html' },
  ])('keeps non-HTTPS renderers and opaque app origins isolated: %j', (overrides) => {
    expect(getRendererSandbox({ ...defaults, ...overrides })).toBe(
      'allow-scripts',
    )
  })
})
