import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { deserializeBigInts, serializeBigInts } from './ssr-bigint-transformer'

type BigIntData =
  | fc.JsonValue
  | bigint
  | readonly BigIntData[]
  | { readonly [key: string]: BigIntData }

type BigIntDataArray = readonly BigIntData[]
type BigIntDataRecord = { readonly [key: string]: BigIntData }

const { value: RECURSIVE_BIGINT_DATA_ARBITRARY } = fc.letrec<{
  value: BigIntData
  array: BigIntDataArray
  record: BigIntDataRecord
}>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small' },
    fc.jsonValue(),
    fc.bigInt(),
    tie('array'),
    tie('record'),
  ),
  array: fc.array(tie('value'), { maxLength: 6 }),
  record: fc.dictionary(fc.string({ maxLength: 20 }), tie('value'), {
    maxKeys: 6,
    noNullPrototype: true,
  }),
}))

describe('SSR BigInt transformer', () => {
  it('round-trips generated data containing BigInts', () => {
    fc.assert(
      fc.property(RECURSIVE_BIGINT_DATA_ARBITRARY, (value) => {
        const serialized = serializeBigInts(value)

        expect(() => JSON.stringify(serialized)).not.toThrow()
        expect(deserializeBigInts(serialized)).toEqual(value)
      }),
    )
  })

  it('does not throw on marker-shaped user data with a non-BigInt value', () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'),
          minLength: 1,
        }),
        (value) => {
          const marker = { __ENS_BIGINT__: value }

          expect(deserializeBigInts(marker)).toEqual(marker)
        },
      ),
    )
  })

  it('does not consume nested user objects that only resemble a BigInt marker', () => {
    fc.assert(
      fc.property(
        fc.bigInt(),
        fc.jsonValue(),
        fc.array(fc.string({ minLength: 1, maxLength: 12 }), {
          maxLength: 6,
        }),
        (bigint, extra, path) => {
          const markerLikeData = path.reduceRight<unknown>(
            (value, key) => ({ [key]: value }),
            {
              __ENS_BIGINT__: bigint.toString(),
              extra,
            },
          )

          expect(deserializeBigInts(markerLikeData)).toEqual(markerLikeData)
        },
      ),
    )
  })
})
