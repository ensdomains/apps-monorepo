/**
 * BigInt round-trip transformer for TanStack Query's SSR dehydrate/hydrate.
 *
 * `JSON.stringify` cannot serialize bigints — and using
 * `BigInt.prototype.toJSON = () => JSON.rawJSON(...)` to dodge that throws
 * away precision for any value above `Number.MAX_SAFE_INTEGER`, because the
 * client's `JSON.parse` decodes unquoted numerics through float64 (this is
 * what previously broke EIP-712 signing in MetaMask/Zerion).
 *
 * Instead, we tag bigints with a marker object on the server during
 * dehydration and restore them on the client during hydration. The marker
 * key is chosen to be unlikely to collide with any real field name in our
 * query data.
 */
const BIGINT_TAG = '__ENS_BIGINT__'
const SERIALIZED_BIGINT = /^(?:0|-?[1-9]\d*)$/

type BigIntMarker = { readonly [BIGINT_TAG]: string }

function isBigIntMarker(value: object): value is BigIntMarker {
  const marker = (value as Partial<BigIntMarker>)[BIGINT_TAG]
  return (
    Object.keys(value).length === 1 &&
    typeof marker === 'string' &&
    SERIALIZED_BIGINT.test(marker)
  )
}

/** Rebuilds `data` with `map` applied to each value; `fromEntries` keeps a `__proto__` key as data. */
const mapEntries = (
  data: object,
  map: (value: unknown) => unknown,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, map(value)]),
  )

export function serializeBigInts(data: unknown): unknown {
  if (typeof data === 'bigint') {
    return { [BIGINT_TAG]: data.toString() } satisfies BigIntMarker
  }
  if (Array.isArray(data)) {
    return data.map(serializeBigInts)
  }
  if (data !== null && typeof data === 'object') {
    return mapEntries(data, serializeBigInts)
  }
  return data
}

export function deserializeBigInts(data: unknown): unknown {
  if (data === null || typeof data !== 'object') {
    return data
  }
  if (Array.isArray(data)) {
    return data.map(deserializeBigInts)
  }
  if (isBigIntMarker(data)) {
    return BigInt(data[BIGINT_TAG])
  }
  return mapEntries(data, deserializeBigInts)
}
