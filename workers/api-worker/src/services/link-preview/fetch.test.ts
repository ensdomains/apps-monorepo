import { assert, describe, expect, it } from 'vitest'
import { readPreviewBody } from './fetch'

describe('readPreviewBody', () => {
  it('reads many small chunks within the byte limit', async () => {
    const expected = Uint8Array.from(
      { length: 256 * 1024 },
      (_, index) => index % 251,
    )
    let offset = 0
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset === expected.byteLength) {
            controller.close()
            return
          }
          controller.enqueue(expected.subarray(offset, offset + 1))
          offset += 1
        },
      }),
    )

    const result = await readPreviewBody({
      response,
      maxBytes: expected.byteLength,
      signal: new AbortController().signal,
    })

    assert(result.isOk())
    expect(new Uint8Array(result.value)).toEqual(expected)
  })
})
