import { beforeEach, describe, expect, it, vi } from 'vitest'

import { downscaleAvatar } from './avatar-image'

const OUTPUT_BYTES = new Uint8Array([9, 9, 9])

interface TransformCall {
  readonly width?: number
  readonly height?: number
  readonly fit?: string
}

/**
 * Stand-in for the Images binding: records what it was asked to do and hands
 * back {@link OUTPUT_BYTES}, so a test can assert on the transform rather than
 * on pixels we'd have to encode by hand.
 */
function mockImages({
  outputContentType = 'image/png',
  fail = false,
}: {
  outputContentType?: string
  fail?: boolean
} = {}) {
  const transforms: TransformCall[] = []
  const outputs: ImageOutputOptions[] = []
  const inputs: { data: Uint8Array; options?: ImageInputOptions }[] = []

  const transformer: ImageTransformer = {
    transform(transform) {
      transforms.push(transform)
      return transformer
    },
    draw: () => transformer,
    async output(options) {
      outputs.push(options)
      if (fail) throw new Error('IMAGES_TRANSFORM_ERROR 9412')

      return {
        contentType: () => outputContentType,
        image: () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(OUTPUT_BYTES)
              controller.close()
            },
          }),
        response: () => new Response(),
      }
    },
  }

  const images = {
    input(stream: ReadableStream<Uint8Array>, options?: ImageInputOptions) {
      // Drain eagerly: the assertions want the bytes we were handed, and the
      // real binding consumes the stream too.
      void new Response(stream)
        .arrayBuffer()
        .then((buf) => inputs.push({ data: new Uint8Array(buf), options }))
      return transformer
    },
    info: vi.fn(),
  } as unknown as ImagesBinding

  return { images, transforms, outputs, inputs }
}

describe('downscaleAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('caps the longest edge at 280px without upscaling', async () => {
    const { images, transforms } = mockImages()

    await downscaleAvatar(images, {
      data: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
    })

    expect(transforms).toEqual([{ width: 280, height: 280, fit: 'scale-down' }])
  })

  it('returns the transformed bytes and the output content type', async () => {
    const { images } = mockImages({ outputContentType: 'image/png' })

    const result = await downscaleAvatar(images, {
      data: new Uint8Array([1, 2, 3]),
      contentType: 'image/webp',
    })

    expect(result).toEqual({ bytes: OUTPUT_BYTES, contentType: 'image/png' })
  })

  it('feeds the source bytes to the binding', async () => {
    const { images, inputs } = mockImages()
    const bytes = new Uint8Array([1, 2, 3, 4])

    await downscaleAvatar(images, { data: bytes, contentType: 'image/png' })

    expect(inputs).toEqual([{ data: bytes, options: { encoding: undefined } }])
  })

  it('passes base64 payloads through the binding’s own decoder', async () => {
    // On-chain avatars arrive as the base64 text of a data: URI; decoding them
    // ourselves just to re-encode would be pure waste.
    const { images, inputs } = mockImages()

    await downscaleAvatar(images, {
      data: 'AQIDBA==',
      contentType: 'image/png',
      encoding: 'base64',
    })

    expect(inputs[0]?.options).toEqual({ encoding: 'base64' })
    expect(new TextDecoder().decode(inputs[0]?.data)).toBe('AQIDBA==')
  })

  describe('output format', () => {
    it('keeps a JPEG source lossy', async () => {
      const { images, outputs } = mockImages()

      await downscaleAvatar(images, {
        data: new Uint8Array([1]),
        contentType: 'image/jpeg',
      })

      expect(outputs[0]).toMatchObject({
        format: 'image/jpeg',
        quality: 85,
      })
    })

    it.each([
      'image/png',
      'image/gif',
      'image/webp',
      'image/avif',
    ])('re-encodes %s as PNG, so transparency survives', async (contentType) => {
      const { images, outputs } = mockImages()

      await downscaleAvatar(images, {
        data: new Uint8Array([1]),
        contentType,
      })

      expect(outputs[0]?.format).toBe('image/png')
    })

    it('matches the content type case-insensitively', async () => {
      const { images, outputs } = mockImages()

      await downscaleAvatar(images, {
        data: new Uint8Array([1]),
        contentType: 'IMAGE/JPEG',
      })

      expect(outputs[0]?.format).toBe('image/jpeg')
    })

    it('flattens animations to a single frame', async () => {
      const { images, outputs } = mockImages()

      await downscaleAvatar(images, {
        data: new Uint8Array([1]),
        contentType: 'image/gif',
      })

      expect(outputs[0]?.anim).toBe(false)
    })
  })

  describe('pass-through cases', () => {
    it('leaves SVG alone — vector art has no pixel budget to cap', async () => {
      const { images, transforms } = mockImages()

      const result = await downscaleAvatar(images, {
        data: '<svg></svg>',
        contentType: 'image/svg+xml',
      })

      expect(result).toBeNull()
      expect(transforms).toHaveLength(0)
    })

    it('returns null when no binding is configured', async () => {
      const result = await downscaleAvatar(undefined, {
        data: new Uint8Array([1]),
        contentType: 'image/png',
      })

      expect(result).toBeNull()
    })

    it('returns null when the Images service rejects the input', async () => {
      // A corrupt upload, or an account without Images enabled: the caller
      // falls back to the original bytes rather than losing the avatar.
      const { images } = mockImages({ fail: true })

      const result = await downscaleAvatar(images, {
        data: new Uint8Array([1]),
        contentType: 'image/png',
      })

      expect(result).toBeNull()
    })
  })
})
