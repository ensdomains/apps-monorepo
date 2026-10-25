/** A non-null object, as untyped event payloads are checked before reading fields. */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
