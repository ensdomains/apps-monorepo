export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const isString = (value: unknown): value is string =>
  typeof value === 'string'

export const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const isBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean'

export const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || isString(value)
