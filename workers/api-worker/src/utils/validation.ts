import * as v from 'valibot'
export const coerceNumber = v.pipe(
  v.union([v.string(), v.number()]),
  v.transform((val) => Number(val)),
)

export const coerceBoolean = v.pipe(
  v.union([v.string(), v.boolean()]),
  v.transform((val) => val === 'true' || val === true),
)

export const ethAddress = v.custom<`0x${string}`>((input) =>
  typeof input === 'string' ? /^0x[0-9a-fA-F]{40}$/.test(input) : false,
)
