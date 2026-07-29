import { describe, expect, it, vi } from 'vitest'
import { sha256Hex } from '../src/media.js'
import {
  findRendererBundleUrl,
  verifyRendererRevision,
} from '../src/rendererRevision.js'

const BUNDLE = 'console.log("renderer")'
const REVISION = `sha256:${sha256Hex(BUNDLE)}`

describe('renderer revision verification', () => {
  it('resolves and verifies the deployed JavaScript entry bundle', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = input.toString()
      return url.endsWith('/assets/index.js')
        ? new Response(BUNDLE)
        : new Response(
            '<html><script type="module" src="/assets/index.js"></script></html>',
          )
    })

    await expect(
      verifyRendererRevision({
        rendererOrigin: 'https://renderer.example',
        rendererRevision: REVISION,
        fetcher,
      }),
    ).resolves.toBe('https://renderer.example/assets/index.js')
  })

  it('rejects a changed or unidentifiable renderer bundle', async () => {
    await expect(
      verifyRendererRevision({
        rendererOrigin: 'https://renderer.example',
        rendererRevision: REVISION,
        fetcher: async (input) =>
          input.toString().endsWith('/bundle.js')
            ? new Response('changed')
            : new Response('<script src="/bundle.js"></script>'),
      }),
    ).rejects.toMatchObject({ name: 'UnsupportedRendererOutputError' })

    expect(() =>
      findRendererBundleUrl('https://renderer.example', '<html></html>'),
    ).toThrow('does not contain')
  })
})
