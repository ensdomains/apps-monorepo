import { describe, expect, it } from 'vitest'
import { toLinkedRecordKeys } from './getLinkedRecordKeys'

describe('toLinkedRecordKeys', () => {
  it('lists each written key once and skips coin types past a safe number', () => {
    expect(
      toLinkedRecordKeys({
        textKeys: ['test', 'description', 'test', undefined],
        coinTypes: [60n, 60n, 2147483658n, 2n ** 64n, undefined],
      }),
    ).toEqual({
      texts: ['test', 'description'],
      coins: [60, 2147483658],
    })
  })
})
