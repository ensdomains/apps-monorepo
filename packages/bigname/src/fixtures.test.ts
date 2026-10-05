import { describe, expect, it } from 'vitest'
import * as postV041 from './postV041.mock'
import { parseTimestamp } from './time'
import * as v041 from './v041.mock'

const TIMESTAMP_KEYS = new Set([
  'expires_at',
  'grace_ends_at',
  'registered_at',
  'created_at',
  'migrated_at',
  'released_at',
  'timestamp',
  'wrapper_expires_at',
])

/** Every `[path, value]` under `value` whose key names a public timestamp. */
const timestampFields = (
  value: unknown,
  path = '',
): Array<readonly [string, unknown]> => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      timestampFields(item, `${path}[${index}]`),
    )
  }
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => [
    ...(TIMESTAMP_KEYS.has(key) && child !== null
      ? [[`${path}.${key}`, child] as const]
      : []),
    ...timestampFields(child, `${path}.${key}`),
  ])
}

describe.each([
  ['v0.4.1', v041],
  ['post-v0.4.1', postV041],
])('%s fixtures', (_version, fixtures) => {
  const entries = Object.entries(fixtures)

  it.each(entries)('%s parses every served timestamp', (_name, fixture) => {
    const fields = timestampFields(fixture)
    for (const [path, value] of fields) {
      expect(typeof value, path).toBe('string')
      expect(parseTimestamp(value as string), path).toBeInstanceOf(Date)
    }
  })
})
